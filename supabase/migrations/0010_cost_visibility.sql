-- Branch users must not see cost fields. Base-table stock reads become
-- admin/top_mgmt only; everyone else reads through stock_visible, which
-- nulls cost columns for non-privileged roles and self-filters by branch.

drop policy stock_read on stock;
create policy stock_read on stock for select to authenticated
  using (auth_role() in ('admin','top_mgmt'));

create or replace view stock_visible with (security_invoker = off) as
select
  s.id, s.legacy_id, s.product_id, s.supplier_id, s.branch_id,
  s.quantity, s.original_quantity, s.serial_number, s.status,
  case when auth_role() in ('admin','top_mgmt') then s.cost_per_unit end as cost_per_unit,
  case when auth_role() in ('admin','top_mgmt') then s.total_cost end as total_cost,
  s.supplier_invoice_no, s.supplier_invoice_date, s.expiry_date,
  s.branch_date_received, s.is_repair_pool, s.is_office_asset, s.return_date,
  s.created_at, s.updated_at
from stock s
where auth_role() in ('admin','top_mgmt') or s.branch_id = auth_branch();

grant select on stock_visible to authenticated;

-- Rebuild aging view on top of stock_visible so branch users keep
-- branch-scoped aging without cost exposure.
drop view if exists stock_aging;
create view stock_aging with (security_invoker = off) as
select v.id, v.product_id, v.branch_id, v.serial_number, v.status,
       v.branch_date_received,
       (current_date - coalesce(v.branch_date_received, v.created_at::date)) as days_on_hand
from stock_visible v
where v.status = 'available';

grant select on stock_aging to authenticated;
