-- Owner requirement: only technical-role staff (Technical/Repairs team) may
-- post repair/earmold status updates, edit assignment, downpayment, remarks,
-- or mark for_replacement. Admin keeps full read visibility (list + detail,
-- unchanged) but loses write access — same shape as 0020's admin+technical
-- split, just narrowed to technical alone. Branch reps are untouched: they
-- still submit repairs/earmolds at intake and can view progress. Public
-- portal (repair-status) and repair_void/earmold_void (0022, admin-only
-- corrections) are out of scope — those are a logged reversal path, not a
-- status update. Technician assignment (repair_requests.assigned_to) was
-- already edited through the same admin+technical "Edit repair" dialog as
-- downpayment/remarks/for_replacement (src/components/repairs/edit-repair-
-- dialog.tsx -> updateRepair -> plain table update governed by
-- repairs_update below), so narrowing that policy to technical-only moves
-- assignment to technical-only as the same side effect — there was no
-- separate admin-only assignment flow to relocate.
--
-- Permissive policies (no `as restrictive`), matching 0020's pattern, so
-- service_role (the /admin/edit backend editor) is unaffected either way —
-- and these tables have no FORCE ROW LEVEL SECURITY, so service_role
-- bypasses RLS entirely regardless.

drop policy repairs_update on repair_requests;
create policy repairs_update on repair_requests for update to authenticated
  using (auth_role() = 'technical')
  with check (auth_role() = 'technical');

drop policy rse_insert on repair_status_events;
create policy rse_insert on repair_status_events for insert to authenticated
  with check (auth_role() = 'technical');

drop policy rse_update on repair_status_events;
create policy rse_update on repair_status_events for update to authenticated
  using (auth_role() = 'technical')
  with check (auth_role() = 'technical');

drop policy earmold_update on earmold_requests;
create policy earmold_update on earmold_requests for update to authenticated
  using (auth_role() = 'technical')
  with check (auth_role() = 'technical');

-- RPC guard: same belt-and-braces reasoning as 0020 (security invoker,
-- would otherwise rely solely on RLS). Narrowed from admin+technical to
-- technical only; body unchanged otherwise.
create or replace function repair_add_event(
  p_repair_id uuid, p_status repair_event_status, p_note text, p_is_public boolean
) returns void language plpgsql security invoker as $$
declare v_header repair_status;
begin
  if auth_role() <> 'technical' then
    raise exception 'not authorized to update repair status';
  end if;

  perform 1 from repair_requests where id = p_repair_id for update;
  if not found then raise exception 'repair not found'; end if;

  insert into repair_status_events (repair_id, status, note, is_public, actor_id)
  values (p_repair_id, p_status, p_note, p_is_public, auth.uid());

  v_header := case p_status
    when 'in_repair' then 'in_progress'::repair_status
    when 'ready' then 'completed'::repair_status
    when 'returned' then 'completed'::repair_status
    else 'pending'::repair_status
  end;

  update repair_requests set status = v_header,
    returned_to_customer_at = case when p_status = 'returned'
      then current_date else returned_to_customer_at end,
    updated_at = now()
    where id = p_repair_id;
end $$;
