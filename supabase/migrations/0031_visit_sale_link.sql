-- Generic visit -> purchase linkage. resulted_in_sale_id (0028) was wired
-- up as hearing-test-only via linkVisitSale's is_hearing_test gate; the new
-- linkSaleToVisit action (src/app/(app)/customers/actions.ts) lets any
-- visit link to the sale it resulted in, from any role/branch. Also adds
-- branch/logger attribution to visits, missing since 0003.

alter table visits add column branch_id uuid references branches(id);
-- No FK to profiles: a deleted/deactivated staff account must not block or
-- cascade against historical visit rows.
alter table visits add column logged_by uuid;

create index idx_visits_resulted_sale on visits(resulted_in_sale_id);
create index idx_visits_customer_date on visits(customer_id, visit_date desc);

-- Reporting view: visits that converted to a sale, with the sale's net
-- total (VAT-inclusive pricing, see 0014_vat.sql) and whether the sale
-- carried stock ("item") and/or service lines. security_invoker matches
-- sales_totals/sales_by_month (0014/0015) so the caller's own RLS applies.
create view visit_conversions with (security_invoker = on) as
select v.id as visit_id, v.customer_id, v.visit_date, v.purpose,
       s.id as sale_id, st.net_sales as sale_total,
       bool_or(l.line_type = 'stock') as has_stock_line,
       bool_or(l.line_type = 'service') as has_service_line
from visits v
join sales s on s.id = v.resulted_in_sale_id
join sales_totals st on st.sale_id = s.id
join sale_line_items l on l.sale_id = s.id
group by v.id, v.customer_id, v.visit_date, v.purpose, s.id, st.net_sales;

grant select on visit_conversions to authenticated;
revoke select on visit_conversions from anon;
