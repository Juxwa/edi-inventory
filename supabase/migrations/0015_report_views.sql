-- Report indexes: stock_movements was only indexed on stock_id (0002);
-- movement reports filter by time, type, and branch.
create index idx_movements_occurred on stock_movements(occurred_at);
create index idx_movements_type_occurred on stock_movements(movement_type, occurred_at);
create index idx_movements_from_branch on stock_movements(from_branch_id);
create index idx_movements_to_branch on stock_movements(to_branch_id);

-- Branch attribution in the raw ledger is directional: sale/transfer_out/
-- repair_out rows carry from_branch_id, return/transfer_in/intake rows carry
-- to_branch_id. This view reconciles both into one branch_id for reporting.
-- left join stock: a branch user's stock RLS may hide rows that moved to
-- another branch; the movement itself must still appear.
create view movements_ledger with (security_invoker = on) as
select m.id, m.occurred_at, m.movement_type, m.quantity,
       case when m.movement_type in ('sale', 'transfer_out', 'repair_out')
            then m.from_branch_id
            else coalesce(m.to_branch_id, m.from_branch_id) end as branch_id,
       case when m.movement_type in ('sale', 'transfer_out', 'repair_out')
            then m.to_branch_id
            else m.from_branch_id end                            as counterparty_branch_id,
       m.stock_id, s.product_id, s.serial_number,
       m.reference_type, m.reference_id, m.actor_id, m.note
from stock_movements m
left join stock s on s.id = m.stock_id;

grant select on movements_ledger to authenticated;
revoke select on movements_ledger from anon;

-- Monthly net-sales rollup over sales_totals (already invoker + VAT-aware).
-- legacy_no_vat_count surfaces imported/pre-VAT sales excluded from vat_total.
create view sales_by_month with (security_invoker = on) as
select branch_id,
       date_trunc('month', sale_date)::date as month,
       count(*)                             as sale_count,
       sum(gross)                           as gross,
       sum(discount)                        as discount_total,
       sum(net_sales)                       as net_sales,
       sum(coalesce(vat_amount, 0))         as vat_total,
       sum(net_of_vat)                      as net_of_vat,
       count(*) filter (where vat_amount is null) as legacy_no_vat_count
from sales_totals
group by 1, 2;

grant select on sales_by_month to authenticated;
revoke select on sales_by_month from anon;
