-- Sale money-entry rework (client feedback round 2 on 0047's discount
-- templates). Two additions:
--   1. "final_price" discount mode — the rep types the receipt's final sale
--      price straight from what was actually charged; discount is derived
--      (gross - final, clamped >= 0). The server action rejects final > gross
--      before this RPC is ever called ("final price exceeds item total").
--   2. Explicit `vat_exempt` flag on sales. Previously VAT-exempt could only
--      be inferred from vat_amount = 0, which is ambiguous (a genuinely tiny
--      VAT-inclusive sale could also round to 0). SC/PWD sales are always
--      VAT-exempt by law (RA 9994 / RA 10754) and now force this flag true.
--
-- Math per mode (server recomputes from lines + mode + declared number —
-- never trusts client-submitted totals; mirrors 0047 for none/SC/PWD/custom):
--   none            : discount = 0; final = gross;
--                      vat_amount = vat_exempt ? 0 : final * 12/112
--   final_price     : final = declared amount (rejected server-side if > gross);
--                      discount = gross - final;
--                      vat_amount = vat_exempt ? 0 : final * 12/112
--   senior_citizen,
--   pwd             : unchanged from 0047 — vat_exempt_base = gross / 1.12;
--                      discount = vat_exempt_base * 0.20; net payable =
--                      vat_exempt_base - discount; vat_amount = 0;
--                      vat_exempt forced true; requires discount_id_no
--   custom_percent  : discount = gross * pct; final = gross - discount;
--                      vat_amount = vat_exempt ? 0 : final * 12/112
--   custom_amount   : discount = min(typed amount, gross); final = gross - discount;
--                      vat_amount = vat_exempt ? 0 : final * 12/112

alter table sales add column if not exists vat_exempt boolean not null default false;

alter table sales drop constraint if exists sales_discount_type_check;
alter table sales add constraint sales_discount_type_check
  check (discount_type is null or discount_type in
    ('none', 'senior_citizen', 'pwd', 'custom_percent', 'custom_amount', 'final_price'));

-- PostgREST cannot disambiguate overloads: drop the 0047 signature first.
drop function if exists sale_record(uuid, uuid, date, text, text, text, text, numeric, numeric, boolean, jsonb, text, text);

create function sale_record(
  p_customer_id uuid, p_branch_id uuid, p_sale_date date,
  p_or_no text, p_csi_no text, p_ci_no text, p_referred_by text,
  p_discount numeric, p_vat_amount numeric, p_is_paid boolean,
  p_lines jsonb,  -- [{line_type, stock_id, service_id, quantity, unit_price, warranty_expiry}]
  p_discount_type text default 'none', p_discount_id_no text default null,
  p_vat_exempt boolean default false
) returns uuid language plpgsql security invoker as $$
declare v_sale_id uuid; v_line jsonb; v_stock stock%rowtype; v_qty numeric;
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
