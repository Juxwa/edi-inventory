-- Staff at any branch need technician/requester/actor names on repairs.
-- profiles carries no email or other sensitive column, so open reads are safe.
drop policy profiles_self on profiles;
create policy profiles_read on profiles for select to authenticated using (true);

-- Intake serial search on the repair form ("From sale" tab).
create index idx_sli_serial on sale_line_items(serial_snapshot);

-- Repair intake: repair row + first 'received' event, atomic.
-- Deliberately does NOT touch stock or write repair_in/repair_out movements:
-- the repaired unit is the customer's own (already sold). Those movement
-- types are reserved for repair-pool loaner tracking, out of scope for now.
-- security invoker: repairs_all / rse_all RLS govern writes.
create or replace function repair_intake(
  p_sar_no text,
  p_customer_id uuid,
  p_contact_no text,
  p_branch_id uuid,
  p_sale_line_item_id uuid,
  p_manual_serial text,
  p_issue_description text,
  p_assigned_to uuid,
  p_downpayment numeric,
  p_initial_note text
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_sar text; v_attempts int := 0;
begin
  loop
    v_sar := coalesce(p_sar_no, 'SAR-' || to_char(current_date, 'YYMMDD') || '-' ||
      upper(substring(gen_random_uuid()::text, 1, 4)));
    begin
      insert into repair_requests (sar_no, customer_id, contact_no,
        requesting_branch_id, requested_by, sale_line_item_id, manual_serial,
        issue_description, assigned_to, downpayment)
      values (v_sar, p_customer_id, p_contact_no, p_branch_id, auth.uid(),
        p_sale_line_item_id, p_manual_serial, p_issue_description,
        p_assigned_to, p_downpayment)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if p_sar_no is not null then
        raise exception 'SAR number % already exists', p_sar_no;
      end if;
      v_attempts := v_attempts + 1;
      if v_attempts >= 5 then raise; end if;
    end;
  end loop;

  insert into repair_status_events (repair_id, status, note, is_public, actor_id)
  values (v_id, 'received', p_initial_note, true, auth.uid());
  return v_id;
end $$;

-- Append a status event and sync the header status in one transaction.
-- received|assessed -> pending, in_repair -> in_progress,
-- ready|returned -> completed; 'returned' also stamps the return date.
-- ('for_replacement' header status is set via direct update, no event maps to it.)
create or replace function repair_add_event(
  p_repair_id uuid, p_status repair_event_status, p_note text, p_is_public boolean
) returns void language plpgsql security invoker as $$
declare v_header repair_status;
begin
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

-- Fixed-window rate limiting for the public repair lookup (phase 5B).
-- Callable only via the service-role client; no anon/authenticated surface.
-- ponytail: fixed window, not sliding — fine at portal traffic volumes.
create table rate_limits (
  key text primary key,
  count int not null,
  window_start timestamptz not null
);

create or replace function consume_rate_limit(
  p_key text, p_max int, p_window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  -- opportunistic cleanup of other expired windows
  delete from rate_limits where window_start < now() - make_interval(secs => p_window_seconds * 2);

  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      then now() else rate_limits.window_start end
  returning count into v_count;

  return v_count <= p_max;
end $$;

revoke all on table rate_limits from public, anon, authenticated;
revoke execute on function consume_rate_limit(text, int, int) from public, anon, authenticated;
