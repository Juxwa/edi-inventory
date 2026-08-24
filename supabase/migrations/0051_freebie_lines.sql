-- Freebie sale lines (client need: receipts sometimes include free items —
-- promo batteries, freebie accessories). Zero price, but stock still
-- deducts and the line is flagged/reportable as a freebie.
--
-- sale_line_items gains is_freebie (default false). sale_record's SIGNATURE
-- is unchanged from 0049 — only the p_lines jsonb payload shape gains an
-- optional `is_freebie` key per line (defaults false when absent), so no
-- drop-then-create of the function is needed, just create-or-replace.
-- Freebie lines force unit_price = 0 on the inserted sale_line_item
-- regardless of what unit_price was submitted, but run the exact same stock
-- path as paid lines (availability check, sold/decrement, movement) —
-- service freebie lines work the same way (price forced 0, no stock to
-- touch). Everything else — SC/PWD discount rules, the general VAT-exempt
-- safety net, gross/discount/VAT math — is copied byte-for-byte from 0049:
-- freebie lines simply contribute 0 to the line total, same as any other
-- 0-price line already did.

alter table sale_line_items add column if not exists is_freebie boolean not null default false;

create or replace function sale_record(
  p_customer_id uuid, p_branch_id uuid, p_sale_date date,
  p_or_no text, p_csi_no text, p_ci_no text, p_referred_by text,
  p_discount numeric, p_vat_amount numeric, p_is_paid boolean,
  p_lines jsonb,  -- [{line_type, stock_id, service_id, quantity, unit_price, warranty_expiry, is_freebie}]
  p_discount_type text default 'none', p_discount_id_no text default null,
  p_vat_exempt boolean default false
) returns uuid language plpgsql security invoker as $$
declare
  v_sale_id uuid; v_line jsonb; v_stock stock%rowtype; v_qty numeric;
  v_is_freebie boolean; v_unit_price numeric;
begin
  if jsonb_array_length(p_lines) = 0 then raise exception 'sale needs at least one line'; end if;
  if p_vat_amount is not null and p_vat_amount < 0 then
    raise exception 'VAT amount cannot be negative';
  end if;
  if p_discount_type in ('senior_citizen', 'pwd') then
    if p_discount_id_no is null or length(trim(p_discount_id_no)) = 0 then
      raise exception 'ID number required for SC/PWD discount';
    end if;
    if coalesce(p_vat_amount, 0) <> 0 then
      raise exception 'SC/PWD discount sales must be VAT-exempt (vat_amount = 0)';
    end if;
    if not coalesce(p_vat_exempt, false) then
      raise exception 'SC/PWD discount sales must be marked VAT-exempt';
    end if;
  end if;
  -- General safety net regardless of discount_type: a sale flagged VAT-exempt
  -- can never carry a non-zero VAT amount.
  if coalesce(p_vat_exempt, false) and coalesce(p_vat_amount, 0) <> 0 then
    raise exception 'VAT-exempt sales cannot have a non-zero VAT amount';
  end if;

  insert into sales (customer_id, branch_id, sold_by, sale_date, or_no, csi_no, ci_no,
    referred_by, discount, vat_amount, is_paid, discount_type, discount_id_no, vat_exempt)
  values (p_customer_id, p_branch_id, auth.uid(), p_sale_date, p_or_no, p_csi_no, p_ci_no,
    p_referred_by, coalesce(p_discount, 0), p_vat_amount, coalesce(p_is_paid, false),
    coalesce(p_discount_type, 'none'), p_discount_id_no, coalesce(p_vat_exempt, false))
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;

    v_is_freebie := coalesce((v_line->>'is_freebie')::boolean, false);
    v_unit_price := case when v_is_freebie then 0 else (v_line->>'unit_price')::numeric end;

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
        unit_price, unit_cost, serial_snapshot, warranty_expiry, is_freebie)
      values (v_sale_id, 'stock', v_stock.id, v_stock.product_id, v_qty,
        v_unit_price, v_stock.cost_per_unit, v_stock.serial_number,
        (v_line->>'warranty_expiry')::date, v_is_freebie);

      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        reference_type, reference_id, actor_id)
      values (v_stock.id, 'sale', v_qty, p_branch_id, 'sale', v_sale_id, auth.uid());
    else
      insert into sale_line_items (sale_id, line_type, service_id, quantity, unit_price, is_freebie)
      values (v_sale_id, 'service', (v_line->>'service_id')::uuid, v_qty,
        v_unit_price, v_is_freebie);
    end if;
  end loop;

  return v_sale_id;
end $$;
