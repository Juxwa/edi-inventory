-- 28k imported sales rows make per-row auth_role()/auth_branch() calls in the
-- sales RLS policies time out under aggregates (sales_by_month, sales_totals
-- as invoker views). Wrapping the calls in scalar subselects lets Postgres
-- evaluate them once per statement (InitPlan) instead of once per row —
-- the standard Supabase RLS performance pattern.

drop policy sales_read on sales;
create policy sales_read on sales for select to authenticated
  using ((select auth_role()) in ('admin', 'top_mgmt')
         or branch_id = (select auth_branch()));

drop policy sales_write on sales;
create policy sales_write on sales for all to authenticated
  using ((select auth_role()) = 'admin' or branch_id = (select auth_branch()))
  with check ((select auth_role()) = 'admin' or branch_id = (select auth_branch()));

drop policy sli_all on sale_line_items;
create policy sli_all on sale_line_items for all to authenticated
  using (exists (select 1 from sales s where s.id = sale_id
         and ((select auth_role()) in ('admin', 'top_mgmt')
              or s.branch_id = (select auth_branch()))))
  with check (exists (select 1 from sales s where s.id = sale_id
         and ((select auth_role()) = 'admin'
              or s.branch_id = (select auth_branch()))));

-- Report filters and branch scoping both hit these columns; neither had an index.
create index idx_sales_branch on sales(branch_id);
create index idx_sales_date on sales(sale_date);
