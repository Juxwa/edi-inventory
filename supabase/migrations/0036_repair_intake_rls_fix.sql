-- Fix functional break introduced by 0033: rse_insert was narrowed to
-- auth_role() = 'technical' only, but repair_intake() (0013, security
-- invoker, unchanged since) inserts the header row AND the first 'received'
-- status event in the same transaction. That means admin and branch_rep
-- users -- who both still pass repairs_insert (0020, untouched by 0033) --
-- now fail on the status-event insert and the whole intake RPC rolls back.
-- Repair intake is completely broken for everyone except technical, which
-- directly contradicts 0033's own stated intent ("branch reps may still
-- create repairs ... drop-off intake").
--
-- Fix (Option A, widen rse_insert): allow the INTAKE event specifically,
-- not status updates in general. The extra branch only opens when ALL of:
--   - status = 'received' (the only status repair_intake ever inserts), AND
--   - the caller is admin, or the branch rep who owns the repair's branch
--     (same shape as repairs_insert's own check), AND
--   - no status event already exists for that repair_id.
-- The "no prior event" guard is what keeps this from becoming a general
-- write hole: once repair_intake's first event lands, this branch is closed
-- for that repair permanently, so a branch_rep/admin cannot use it to insert
-- a second event or advance status later -- that still requires technical,
-- via repair_add_event (0033's guard is untouched here and still rejects
-- non-technical callers outright).
drop policy rse_insert on repair_status_events;
create policy rse_insert on repair_status_events for insert to authenticated
  with check (
    auth_role() = 'technical'
    or (
      status = 'received'
      and exists (
        select 1 from repair_requests r
        where r.id = repair_status_events.repair_id
          and (auth_role() = 'admin' or r.requesting_branch_id = auth_branch())
      )
      and not exists (
        select 1 from repair_status_events e
        where e.repair_id = repair_status_events.repair_id
      )
    )
  );
