-- Phase 6 item 5: Top Management analytics dashboard.
-- Two reporting views, monthly grain, admin/top_mgmt only. security_invoker
-- is deliberately OFF (these are security-definer views) so the auth_role()
-- filter inside the view body is what keeps branch/technical roles from
-- reading anything through them — the same pattern as stock_visible (0010).
-- Cost is only ever exposed on analytics_sales_by_product, matching the
-- existing "cost visible to admin/top_mgmt only" rule.
--
-- Depends on sales.voided_at (added in 0022_admin_corrections.sql) and
-- sale_line_items.product_id (added in 0011_sales_rpcs.sql) — both present.

create view analytics_sales_by_product with (security_invoker = off) as
select l.product_id, p.name as product_name, pc.name as category,
       s.branch_id, b.name as branch_name,
       date_trunc('month', s.sale_date)::date as month,
       sum(l.quantity) as units,
       sum(l.quantity * l.unit_price) as revenue,
       sum(l.quantity * coalesce(l.unit_cost, 0)) as cost
from sale_line_items l
join sales s on s.id = l.sale_id
left join products p on p.id = l.product_id
left join product_categories pc on pc.id = p.category_id
left join branches b on b.id = s.branch_id
where l.line_type = 'stock' and s.voided_at is null
  and auth_role() in ('admin','top_mgmt')
group by 1,2,3,4,5,6;

grant select on analytics_sales_by_product to authenticated;
revoke select on analytics_sales_by_product from anon;

create view analytics_sales_by_service with (security_invoker = off) as
select l.service_id, sv.name as service_name, s.branch_id, b.name as branch_name,
       date_trunc('month', s.sale_date)::date as month,
       sum(l.quantity) as units, sum(l.quantity * l.unit_price) as revenue
from sale_line_items l
join sales s on s.id = l.sale_id
left join services sv on sv.id = l.service_id
left join branches b on b.id = s.branch_id
where l.line_type = 'service' and s.voided_at is null
  and auth_role() in ('admin','top_mgmt')
group by 1,2,3,4,5;

grant select on analytics_sales_by_service to authenticated;
revoke select on analytics_sales_by_service from anon;
