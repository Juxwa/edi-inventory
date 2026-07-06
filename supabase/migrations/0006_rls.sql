create function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create function auth_branch() returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from profiles where id = auth.uid() $$;

alter table branches enable row level security;
alter table suppliers enable row level security;
alter table product_categories enable row level security;
alter table products enable row level security;
alter table services enable row level security;
alter table service_pricing enable row level security;
alter table profiles enable row level security;
alter table stock enable row level security;
alter table stock_movements enable row level security;
alter table customers enable row level security;
alter table visits enable row level security;
alter table sales enable row level security;
alter table sale_line_items enable row level security;
alter table inventory_requests enable row level security;
alter table request_line_items enable row level security;
alter table transfers enable row level security;
alter table transfer_line_items enable row level security;
alter table repair_requests enable row level security;
alter table repair_status_events enable row level security;
alter table earmold_requests enable row level security;

-- Catalog tables: all authenticated read; admin writes
create policy cat_read on branches for select to authenticated using (true);
create policy cat_read on suppliers for select to authenticated using (true);
create policy cat_read on product_categories for select to authenticated using (true);
create policy cat_read on products for select to authenticated using (true);
create policy cat_read on services for select to authenticated using (true);
create policy cat_read on service_pricing for select to authenticated using (true);
create policy cat_admin_write on branches for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy cat_admin_write on suppliers for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy cat_admin_write on products for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy cat_admin_write on services for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy cat_admin_write on service_pricing for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Profiles: own row read; admin all
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin on profiles for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Branch-scoped pattern: admin/top_mgmt see all; others own branch only
create policy stock_read on stock for select to authenticated
  using (auth_role() in ('admin','top_mgmt') or branch_id = auth_branch());
create policy stock_write on stock for all to authenticated
  using (auth_role() = 'admin' or branch_id = auth_branch())
  with check (auth_role() = 'admin' or branch_id = auth_branch());

create policy movements_read on stock_movements for select to authenticated
  using (auth_role() in ('admin','top_mgmt')
         or from_branch_id = auth_branch() or to_branch_id = auth_branch());
create policy movements_insert on stock_movements for insert to authenticated
  with check (auth_role() in ('admin','top_mgmt')
              or from_branch_id = auth_branch() or to_branch_id = auth_branch());

create policy customers_read on customers for select to authenticated
  using (auth_role() in ('admin','top_mgmt') or branch_created_id = auth_branch());
create policy customers_write on customers for all to authenticated
  using (auth_role() = 'admin' or branch_created_id = auth_branch())
  with check (auth_role() = 'admin' or branch_created_id = auth_branch());

create policy visits_all on visits for all to authenticated
  using (auth_role() in ('admin','top_mgmt')
         or exists (select 1 from customers c where c.id = customer_id
                    and c.branch_created_id = auth_branch()))
  with check (auth_role() in ('admin','top_mgmt')
         or exists (select 1 from customers c where c.id = customer_id
                    and c.branch_created_id = auth_branch()));

create policy sales_read on sales for select to authenticated
  using (auth_role() in ('admin','top_mgmt') or branch_id = auth_branch());
create policy sales_write on sales for all to authenticated
  using (auth_role() = 'admin' or branch_id = auth_branch())
  with check (auth_role() = 'admin' or branch_id = auth_branch());
create policy sli_all on sale_line_items for all to authenticated
  using (exists (select 1 from sales s where s.id = sale_id
         and (auth_role() in ('admin','top_mgmt') or s.branch_id = auth_branch())))
  with check (exists (select 1 from sales s where s.id = sale_id
         and (auth_role() = 'admin' or s.branch_id = auth_branch())));

create policy req_all on inventory_requests for all to authenticated
  using (auth_role() in ('admin','top_mgmt') or requesting_branch_id = auth_branch())
  with check (auth_role() = 'admin' or requesting_branch_id = auth_branch());
create policy rli_all on request_line_items for all to authenticated
  using (exists (select 1 from inventory_requests r where r.id = request_id
         and (auth_role() in ('admin','top_mgmt') or r.requesting_branch_id = auth_branch())))
  with check (exists (select 1 from inventory_requests r where r.id = request_id
         and (auth_role() = 'admin' or r.requesting_branch_id = auth_branch())));

create policy transfers_all on transfers for all to authenticated
  using (auth_role() in ('admin','top_mgmt')
         or from_branch_id = auth_branch() or to_branch_id = auth_branch())
  with check (auth_role() = 'admin' or from_branch_id = auth_branch());
create policy tli_all on transfer_line_items for all to authenticated
  using (exists (select 1 from transfers t where t.id = transfer_id
         and (auth_role() in ('admin','top_mgmt')
              or t.from_branch_id = auth_branch() or t.to_branch_id = auth_branch())))
  with check (exists (select 1 from transfers t where t.id = transfer_id
         and (auth_role() = 'admin' or t.from_branch_id = auth_branch())));

-- Repairs: technical role sees all repairs; branch users own branch
create policy repairs_all on repair_requests for all to authenticated
  using (auth_role() in ('admin','top_mgmt','technical')
         or requesting_branch_id = auth_branch())
  with check (auth_role() in ('admin','technical')
         or requesting_branch_id = auth_branch());
create policy rse_all on repair_status_events for all to authenticated
  using (exists (select 1 from repair_requests r where r.id = repair_id
         and (auth_role() in ('admin','top_mgmt','technical')
              or r.requesting_branch_id = auth_branch())))
  with check (exists (select 1 from repair_requests r where r.id = repair_id
         and (auth_role() in ('admin','technical')
              or r.requesting_branch_id = auth_branch())));
create policy earmold_all on earmold_requests for all to authenticated
  using (auth_role() in ('admin','top_mgmt','technical')
         or requesting_branch_id = auth_branch())
  with check (auth_role() in ('admin','technical')
         or requesting_branch_id = auth_branch());
