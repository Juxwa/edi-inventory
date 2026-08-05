-- Customer isolation for selected branches (owner request, 2026-08-04):
-- Tacloban, Bacolod, and Gensan operate sandboxed — their customers are
-- visible only to their own branch (+ admin/top_mgmt), and staff at those
-- branches see only their own customers, not the shared pool. All other
-- branches keep the shared customer directory from 0011 unchanged.
--
-- A customer is "linked" to a branch when created there or having any
-- sale / visit / repair there. Customers linked to both an isolated branch
-- and another branch (13 rows at time of writing) stay visible to each
-- linked branch. Consequence accepted by owner: an isolated branch's
-- customer walking into another branch can't be looked up there and will be
-- re-entered as a new customer (mergeable later via customer_merge_log
-- tooling).

alter table branches add column if not exists customers_isolated boolean not null default false;

update branches set customers_isolated = true
where name in ('EDI Tacloban', 'EDI Bacolod', 'EDI Gensan');

-- indexes so the policy's exists() probes stay cheap on list pages
create index if not exists idx_sales_customer_branch on sales(customer_id, branch_id);
create index if not exists idx_visits_customer_branch on visits(customer_id, branch_id);
create index if not exists idx_repairs_customer_branch
  on repair_requests(customer_id, requesting_branch_id);

-- security definer: reads sales/visits/repairs without their RLS (and without
-- recursing into customers policies).
create or replace function customer_visible(cid uuid, cust_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth_role() in ('admin', 'top_mgmt')
    or (
      auth_branch() is not null
      and (
        -- linked to the viewer's branch
        cust_branch = auth_branch()
        or exists (select 1 from sales s
                   where s.customer_id = cid and s.branch_id = auth_branch())
        or exists (select 1 from visits v
                   where v.customer_id = cid and v.branch_id = auth_branch())
        or exists (select 1 from repair_requests r
                   where r.customer_id = cid
                     and r.requesting_branch_id = auth_branch())
        -- or shared pool: viewer's branch is not isolated AND the customer
        -- has no link to any isolated branch
        or (
          not exists (select 1 from branches b
                      where b.id = auth_branch() and b.customers_isolated)
          and not exists (
            select 1 from branches b
            where b.customers_isolated
              and (
                cust_branch = b.id
                or exists (select 1 from sales s
                           where s.customer_id = cid and s.branch_id = b.id)
                or exists (select 1 from visits v
                           where v.customer_id = cid and v.branch_id = b.id)
                or exists (select 1 from repair_requests r
                           where r.customer_id = cid
                             and r.requesting_branch_id = b.id)
              )
          )
        )
      )
    )
$$;

revoke all on function customer_visible(uuid, uuid) from public;
grant execute on function customer_visible(uuid, uuid) to authenticated;

drop policy customers_read on customers;
create policy customers_read on customers for select to authenticated
  using (customer_visible(id, branch_created_id));
