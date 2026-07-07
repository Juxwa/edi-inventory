alter table sale_line_items add column product_id uuid references products(id);
alter table sale_line_items drop constraint sale_line_items_check;
alter table sale_line_items add constraint sale_line_items_check check (
  (line_type = 'stock' and (stock_id is not null or product_id is not null) and service_id is null)
  or (line_type = 'service' and service_id is not null and stock_id is null)
);

create or replace function sale_record(
  p_customer_id uuid, p_branch_id uuid, p_sale_date date,
  p_or_no text, p_csi_no text, p_ci_no text, p_referred_by text,
  p_discount numeric, p_is_paid boolean,
  p_lines jsonb  -- [{line_type, stock_id, service_id, quantity, unit_price, warranty_expiry}]
) returns uuid language plpgsql security invoker as $$
declare v_sale_id uuid; v_line jsonb; v_stock stock%rowtype; v_qty numeric;
begin
  if jsonb_array_length(p_lines) = 0 then raise exception 'sale needs at least one line'; end if;

  insert into sales (customer_id, branch_id, sold_by, sale_date, or_no, csi_no, ci_no,
    referred_by, discount, is_paid)
  values (p_customer_id, p_branch_id, auth.uid(), p_sale_date, p_or_no, p_csi_no, p_ci_no,
    p_referred_by, coalesce(p_discount, 0), coalesce(p_is_paid, false))
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

-- security definer: returned stock may need status flips regardless of caller branch
-- nuance; explicit guard: caller must be admin or belong to the selling branch.
create or replace function sale_return_line(
  p_line_id uuid, p_quantity numeric, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_line sale_line_items%rowtype; v_sale sales%rowtype; v_stock stock%rowtype;
        v_already numeric; v_new_status after_sales_status;
begin
  select * into v_line from sale_line_items where id = p_line_id for update;
  if not found then raise exception 'line not found'; end if;
  if v_line.line_type <> 'stock' then raise exception 'only stock lines can be returned'; end if;
  select * into v_sale from sales where id = v_line.sale_id;
  if not (auth_role() = 'admin' or auth_branch() = v_sale.branch_id) then
    raise exception 'not authorized';
  end if;
  v_already := coalesce(v_line.returned_quantity, 0);
  if p_quantity <= 0 or v_already + p_quantity > v_line.quantity then
    raise exception 'invalid return quantity';
  end if;
  if v_line.serial_snapshot is not null and p_quantity <> v_line.quantity then
    raise exception 'serialized items must be returned in full';
  end if;

  if v_line.stock_id is not null then
    select * into v_stock from stock where id = v_line.stock_id for update;
    if v_stock.serial_number is not null then
      update stock set status = 'available', return_date = current_date,
        updated_at = now() where id = v_stock.id;
    else
      update stock set quantity = quantity + p_quantity,
        status = 'available',
        total_cost = cost_per_unit * (quantity + p_quantity),
        return_date = current_date, updated_at = now() where id = v_stock.id;
    end if;
    insert into stock_movements (stock_id, movement_type, quantity, to_branch_id,
      reference_type, reference_id, actor_id)
    values (v_stock.id, 'return', p_quantity, v_sale.branch_id, 'sale', v_sale.id, auth.uid());
  end if;

  if v_already + p_quantity = v_line.quantity then v_new_status := 'returned';
  else v_new_status := 'partially_returned'; end if;

  update sale_line_items set returned_quantity = v_already + p_quantity,
    return_date = current_date, after_sales_status = v_new_status, updated_at = now()
    where id = p_line_id;
end $$;

-- Task 6 finding: reps need cross-branch customer read for walk-in continuity
-- (sales staff at any branch may serve a customer originally created elsewhere).
-- Writes remain branch-scoped via customers_write.
drop policy customers_read on customers;
create policy customers_read on customers for select to authenticated using (true);
