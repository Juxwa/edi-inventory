-- 0042's customer_visible() is a security definer function, so Postgres can't
-- inline it into the customers policy — it ran per row (19k rows x up to 9
-- subqueries) and full-table scans (the customers list page count) hit the
-- statement timeout. Replace it with a materialized customer->branch link
-- table kept fresh by triggers, and a plain SQL policy using the 0017
-- initplan pattern. Semantics unchanged from 0042.

create table customer_branches (
  customer_id uuid not null references customers(id) on delete cascade,
  branch_id uuid not null references branches(id),
  primary key (customer_id, branch_id)
);

alter table customer_branches enable row level security;
-- link rows are opaque uuid pairs (no PII); readable so policy subqueries work
create policy cb_read on customer_branches for select to authenticated using (true);
-- no write policies: rows are written only by the definer function below

create or replace function cb_link(cid uuid, bid uuid) returns void
language sql
security definer
set search_path = public
as $$
  insert into customer_branches (customer_id, branch_id)
  select cid, bid
  where cid is not null and bid is not null
  on conflict do nothing;
$$;
revoke all on function cb_link(uuid, uuid) from public;
grant execute on function cb_link(uuid, uuid) to authenticated;

create or replace function trg_cb_customers() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform cb_link(new.id, new.branch_created_id); return new; end $$;
create or replace function trg_cb_sales() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform cb_link(new.customer_id, new.branch_id); return new; end $$;
create or replace function trg_cb_visits() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform cb_link(new.customer_id, new.branch_id); return new; end $$;
create or replace function trg_cb_repairs() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform cb_link(new.customer_id, new.requesting_branch_id); return new; end $$;

create trigger cb_customers after insert or update of branch_created_id
  on customers for each row execute function trg_cb_customers();
create trigger cb_sales after insert or update of customer_id, branch_id
  on sales for each row execute function trg_cb_sales();
create trigger cb_visits after insert or update of customer_id, branch_id
  on visits for each row execute function trg_cb_visits();
create trigger cb_repairs after insert or update of customer_id, requesting_branch_id
  on repair_requests for each row execute function trg_cb_repairs();

-- backfill from existing data
insert into customer_branches (customer_id, branch_id)
  select id, branch_created_id from customers
  where branch_created_id is not null
on conflict do nothing;
insert into customer_branches (customer_id, branch_id)
  select distinct customer_id, branch_id from sales
  where customer_id is not null
on conflict do nothing;
insert into customer_branches (customer_id, branch_id)
  select distinct customer_id, branch_id from visits
  where customer_id is not null and branch_id is not null
on conflict do nothing;
insert into customer_branches (customer_id, branch_id)
  select distinct customer_id, requesting_branch_id from repair_requests
  where customer_id is not null and requesting_branch_id is not null
on conflict do nothing;

-- same semantics as 0042, now inlineable: admin/top_mgmt see all; a branch
-- sees customers linked to it; non-isolated branches additionally see the
-- shared pool (customers with no isolated-branch link).
drop policy customers_read on customers;
create policy customers_read on customers for select to authenticated
  using (
    (select auth_role()) in ('admin', 'top_mgmt')
    or exists (select 1 from customer_branches cb
               where cb.customer_id = customers.id
                 and cb.branch_id = (select auth_branch()))
    or (
      not exists (select 1 from branches b
                  where b.id = (select auth_branch()) and b.customers_isolated)
      and not exists (select 1 from customer_branches cb
                      join branches b on b.id = cb.branch_id
                      where cb.customer_id = customers.id
                        and b.customers_isolated)
    )
  );

drop function if exists customer_visible(uuid, uuid);
