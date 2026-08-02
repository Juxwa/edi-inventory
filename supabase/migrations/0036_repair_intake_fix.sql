-- Fix: 0033 narrowed rse_insert to technical-only, but repair_intake (0013,
-- security invoker) inserts the initial 'received' event in the same
-- transaction as the repair header. That broke repair INTAKE for admin and
-- branch_rep entirely (the whole RPC rolls back on the event insert).
--
-- Restore intake for whoever may create the repair header (admin, or the
-- requesting branch's rep — matching repairs_insert in 0020), while keeping
-- ongoing status ADVANCEMENT technical-only:
--   * technical may insert any event (status updates), as 0033 intended;
--   * anyone who owns the repair may insert ONLY the first 'received' event
--     (the intake row) — a non-technical user cannot advance status because
--     any later event fails the "no prior event" test, and repair_add_event
--     additionally guards to technical-only (0033).

drop policy rse_insert on repair_status_events;
create policy rse_insert on repair_status_events for insert to authenticated
  with check (
    auth_role() = 'technical'
    or (
      status = 'received'
      and not exists (
        select 1 from repair_status_events e
        where e.repair_id = repair_status_events.repair_id
      )
      and exists (
        select 1 from repair_requests r
        where r.id = repair_status_events.repair_id
          and (auth_role() = 'admin' or r.requesting_branch_id = auth_branch())
      )
    )
  );
