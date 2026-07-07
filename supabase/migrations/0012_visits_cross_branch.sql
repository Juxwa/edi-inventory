-- Patients visit any branch; visit records must not be locked to the branch
-- that originally created the customer. Mirrors the customers_read loosening.
drop policy visits_all on visits;
create policy visits_read on visits for select to authenticated using (true);
create policy visits_write on visits for all to authenticated
  using (auth_role() in ('admin','branch_rep','top_mgmt'))
  with check (auth_role() in ('admin','branch_rep','top_mgmt'));
