-- 0036's rse_insert WITH CHECK queries repair_status_events from inside a
-- policy ON repair_status_events; Postgres raises 42P17 (infinite recursion in
-- policy) on every insert, which broke repair intake for all roles. Move the
-- "no prior event" test into a security definer helper so the lookup bypasses
-- RLS on the same table instead of recursing into it.

create or replace function repair_has_events(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from repair_status_events where repair_id = rid);
$$;

revoke all on function repair_has_events(uuid) from public;
grant execute on function repair_has_events(uuid) to authenticated;

drop policy rse_insert on repair_status_events;
create policy rse_insert on repair_status_events for insert to authenticated
  with check (
    auth_role() = 'technical'
    or (
      status = 'received'
      and not repair_has_events(repair_id)
      and exists (
        select 1 from repair_requests r
        where r.id = repair_status_events.repair_id
          and (auth_role() = 'admin' or r.requesting_branch_id = auth_branch())
      )
    )
  );
