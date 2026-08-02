-- Executive view (top_mgmt) additions to /analytics: VIP customers,
-- growth drivers, repairs-by-product. Same pattern as 0023_analytics_views:
-- security_invoker OFF (security-definer views) with an auth_role() filter
-- inside the view body gating admin/top_mgmt, matching stock_visible (0010).

-- VIP customers: per-sale grain (customer/branch/date), like sales_totals
-- (0003) but customer-scoped and voided-excluded, so the TS layer can
-- aggregate total value / sale count / last purchase date over any date
-- range exactly like it already does for analytics_sales_by_product.
create view analytics_sales_by_customer with (security_invoker = off) as
select s.id as sale_id, s.customer_id, c.name as customer_name,
       s.branch_id, b.name as branch_name, s.sale_date,
       sum(l.quantity * l.unit_price) - s.discount as net_sales
from sales s
join sale_line_items l on l.sale_id = s.id
left join customers c on c.id = s.customer_id
left join branches b on b.id = s.branch_id
where s.voided_at is null and s.customer_id is not null
  and auth_role() in ('admin','top_mgmt')
group by s.id, s.customer_id, c.name, s.branch_id, b.name, s.sale_date, s.discount;

grant select on analytics_sales_by_customer to authenticated;
revoke select on analytics_sales_by_customer from anon;

-- Repairs by product: closest available proxy for "brand" usage — the
-- schema has no brand/manufacturer column (products only carry name,
-- category, code), so this groups by product name. Links each repair to a
-- product two ways: via sale_line_item_id (the repair intake form's "From
-- sale" path, populated for any repair recorded through the app) or, for
-- legacy rows that only carry manual_serial (all current imported repairs,
-- which came in as a bare serial with no sale link), by matching that
-- serial against stock.serial_number. stock.serial_number has no unique
-- constraint (0024's note), so the lateral picks one deterministic match
-- (oldest stock row) rather than fanning out. Repairs that match neither
-- path are excluded from this view — the UI shows an empty state rather
-- than an "unlinked" bucket when nothing resolves.
create view analytics_repairs_by_product with (security_invoker = off) as
select p.id as product_id, p.name as product_name, pc.name as category,
       date_trunc('month', r.request_date)::date as month,
       count(*) as repair_count
from repair_requests r
left join sale_line_items sli on sli.id = r.sale_line_item_id
left join lateral (
  select st.id from stock st
  where r.sale_line_item_id is null
    and r.manual_serial is not null
    and lower(trim(st.serial_number)) = lower(trim(r.manual_serial))
  order by st.created_at
  limit 1
) matched on true
join stock s2 on s2.id = coalesce(sli.stock_id, matched.id)
join products p on p.id = s2.product_id
left join product_categories pc on pc.id = p.category_id
where auth_role() in ('admin','top_mgmt')
group by p.id, p.name, pc.name, 4;

grant select on analytics_repairs_by_product to authenticated;
revoke select on analytics_repairs_by_product from anon;

-- Growth drivers (revenue delta vs. prior equal-length period) need no new
-- view: the page already fetches analytics_sales_by_product for both the
-- current and previous period (0023) and aggregates it client-side via
-- aggregateSkus — computeGrowthDrivers (query.ts) just diffs the two
-- aggregate maps, same "view supplies filtered facts, TS aggregates" split
-- used everywhere else on this page.
