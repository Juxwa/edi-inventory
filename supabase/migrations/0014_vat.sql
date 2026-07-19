-- VAT capture on sales (PH 12%, VAT-inclusive pricing). vat_amount existed
-- since 0003 but was never populated. Null = not captured (legacy/imported);
-- reports must treat null as unknown, never backfill 12/112 (would fabricate
-- VAT on exempt sales, e.g. SC/PWD discounted).

-- PostgREST cannot disambiguate overloads: drop the old signature first.
drop function sale_record(uuid, uuid, date, text, text, text, text, numeric, boolean, jsonb);

create function sale_record(
  p_customer_id uuid, p_branch_id uuid, p_sale_date date,
  p_or_no text, p_csi_no text, p_ci_no text, p_referred_by text,
  p_discount numeric, p_vat_amount numeric, p_is_paid boolean,
  p_lines jsonb  -- [{line_type, stock_id, service_id, quantity, unit_price, warranty_expiry}]
) returns uuid language plpgsql security invoker as $$
declare v_sale_id uuid; v_line jsonb; v_stock stock%rowtype; v_qty numeric;
begin
  if jsonb_array_length(p_lines) = 0 then raise exception 'sale needs at least one line'; end if;
  if p_vat_amount is not null and p_vat_amount < 0 then
    raise exception 'VAT amount cannot be negative';
  end if;

  insert into sales (customer_id, branch_id, sold_by, sale_date, or_no, csi_no, ci_no,
    referred_by, discount, vat_amount, is_paid)
  values (p_customer_id, p_branch_id, auth.uid(), p_sale_date, p_or_no, p_csi_no, p_ci_no,
    p_referred_by, coalesce(p_discount, 0), p_vat_amount, coalesce(p_is_paid, false))
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;

    if v_line->>'line_type' = 'stock' then
      select * into v_stock from stock where id = (v_line->>'stock_id')::uuid for update;
      if not found then raise exception 'stock not found'; end if;
      if v_stock.branch_id <> p_branch_id then raise exception 'stock not at selling branch'; end if;
      if v_stock.status <> 'available' then raise exception 'stock % not available',
        coalesce(v_stock.serial_number, v_stock.id::text); end if;
      if v_qty > v_stock.quantity then raise exception 'insufficient quantity'; end if;

      if v_stock.serial_number is not null or v_qty = v_stock.quantity then
        update stock set status = 'sold', updated_at = now() where id = v_stock.id;
      else
        update stock set quantity = quantity - v_qty,
          total_cost = cost_per_unit * (quantity - v_qty), updated_at = now()
          where id = v_stock.id;
      end if;

      insert into sale_line_items (sale_id, line_type, stock_id, product_id, quantity,
        unit_price, unit_cost, serial_snapshot, warranty_expiry)
      values (v_sale_id, 'stock', v_stock.id, v_stock.product_id, v_qty,
        (v_line->>'unit_price')::numeric, v_stock.cost_per_unit, v_stock.serial_number,
        (v_line->>'warranty_expiry')::date);

      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        reference_type, reference_id, actor_id)
      values (v_stock.id, 'sale', v_qty, p_branch_id, 'sale', v_sale_id, auth.uid());
    else
      insert into sale_line_items (sale_id, line_type, service_id, quantity, unit_price)
      values (v_sale_id, 'service', (v_line->>'service_id')::uuid, v_qty,
        (v_line->>'unit_price')::numeric);
    end if;
  end loop;

  return v_sale_id;
end $$;

-- Rebuild sales_totals with VAT columns AND invoker semantics. The 0003 view
-- had definer semantics (Postgres default), letting any authenticated user —
-- and via default grants, anon — read totals across branches. invoker = on
-- makes the sales RLS policies apply to the reader.
drop view if exists sales_totals;
create view sales_totals with (security_invoker = on) as
select s.id as sale_id, s.branch_id, s.sale_date, s.is_paid,
       sum(l.unit_price * l.quantity)                          as gross,
       s.discount,
       sum(l.unit_price * l.quantity) - s.discount             as net_sales,
       s.vat_amount,                                            -- null = not captured
       sum(l.unit_price * l.quantity) - s.discount
         - coalesce(s.vat_amount, 0)                            as net_of_vat,
       (s.vat_amount is not null and s.vat_amount > 0)          as is_vatable
from sales s join sale_line_items l on l.sale_id = s.id
group by s.id;

grant select on sales_totals to authenticated;
revoke select on sales_totals from anon;
-- Hygiene: the cost-hiding views keep definer semantics on purpose (0010),
-- but anon has no business reading them either.
revoke select on stock_visible from anon;
revoke select on stock_aging from anon;
