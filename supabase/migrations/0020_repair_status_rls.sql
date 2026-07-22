-- Phase 6 item 2: branch reps may still create repairs/earmolds (drop-off
-- intake) but only admin + technical may advance their status. Split the
-- blanket `for all` policies on repair_requests, earmold_requests and
-- repair_status_events into select/insert/update with tighter write scoping.

drop policy repairs_all on repair_requests;
drop policy rse_all on repair_status_events;
drop policy earmold_all on earmold_requests;

-- repair_requests: unchanged read visibility (admin/top_mgmt/technical all;
-- branch users own branch). Insert stays open to admin/technical/branch reps
-- for their own branch (same shape as the old combined check). Update
-- (status/assignment/etc.) restricted to admin + technical.
create policy repairs_select on repair_requests for select to authenticated
  using (auth_role() in ('admin','top_mgmt','technical')
         or requesting_branch_id = auth_branch());
create policy repairs_insert on repair_requests for insert to authenticated
  with check (auth_role() in ('admin','technical')
         or requesting_branch_id = auth_branch());
create policy repairs_update on repair_requests for update to authenticated
  using (auth_role() in ('admin','technical'))
  with check (auth_role() in ('admin','technical'));

-- repair_status_events: unchanged read visibility. Insert AND update
-- restricted to admin + technical (branch reps no longer post events).
create policy rse_select on repair_status_events for select to authenticated
  using (exists (select 1 from repair_requests r where r.id = repair_id
         and (auth_role() in ('admin','top_mgmt','technical')
              or r.requesting_branch_id = auth_branch())));
create policy rse_insert on repair_status_events for insert to authenticated
  with check (auth_role() in ('admin','technical'));
create policy rse_update on repair_status_events for update to authenticated
  using (auth_role() in ('admin','technical'))
  with check (auth_role() in ('admin','technical'));

-- earmold_requests: same shape as repair_requests.
create policy earmold_select on earmold_requests for select to authenticated
  using (auth_role() in ('admin','top_mgmt','technical')
         or requesting_branch_id = auth_branch());
create policy earmold_insert on earmold_requests for insert to authenticated
  with check (auth_role() in ('admin','technical')
         or requesting_branch_id = auth_branch());
create policy earmold_update on earmold_requests for update to authenticated
  using (auth_role() in ('admin','technical'))
  with check (auth_role() in ('admin','technical'));

-- RPC guard: repair_add_event recreated verbatim from 0013 with an
-- authorization check at the top. Belt-and-braces alongside the RLS above,
-- since this is security invoker and would otherwise rely solely on RLS.
create or replace function repair_add_event(
  p_repair_id uuid, p_status repair_event_status, p_note text, p_is_public boolean
) returns void language plpgsql security invoker as $$
declare v_header repair_status;
begin
  if auth_role() not in ('admin','technical') then
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
