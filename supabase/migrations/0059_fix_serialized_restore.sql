-- Bug: sale_return_line (0011) and sale_void (0022) restored serialized
-- stock by flipping status to 'available' but never restoring quantity —
-- the sale had zeroed it, so every serialized return/void since launch
-- left the row available with quantity 0 (invisible to availability,
-- unsellable). Non-serialized lots were handled correctly. Found via
-- HFL1216 (returned + voided 2026-09-28, qty stayed 0).
--
-- Fix: serialized restore now sets quantity = 1 (serialized rows are
-- qty <= 1 by the 0045 constraint) and recomputes total_cost. A guard
-- raises a clear error if another ACTIVE row already exists for the same
-- serial (would otherwise surface as a unique-index violation from 0045).
--
-- Data repair for historical casualties ships separately (see
-- docs/serialized-restore-repair.sql) — this migration only fixes the
-- functions going forward.

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
      perform 1 from stock
        where lower(trim(serial_number)) = lower(trim(v_stock.serial_number))
          and id <> v_stock.id and quantity > 0 and status <> 'sold';
      if found then
        raise exception 'another active stock row already exists for serial % — resolve it before returning', v_stock.serial_number;
      end if;
      update stock set status = 'available', quantity = 1,
        total_cost = cost_per_unit, return_date = current_date,
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

create or replace function sale_void(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale sales%rowtype;
  v_line sale_line_items%rowtype;
  v_stock stock%rowtype;
  v_remaining numeric;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found'; end if;
  if v_sale.voided_at is not null then raise exception 'sale already voided'; end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from sale_line_items l
                        where l.sale_id = p_sale_id), '[]'::jsonb)
  ) into v_before;

  for v_line in
    select * from sale_line_items
    where sale_id = p_sale_id and line_type = 'stock' and after_sales_status <> 'returned'
    for update
  loop
    v_remaining := v_line.quantity - coalesce(v_line.returned_quantity, 0);
    if v_remaining > 0 and v_line.stock_id is not null then
      select * into v_stock from stock where id = v_line.stock_id for update;
      if found then
        if v_stock.serial_number is not null then
          perform 1 from stock
            where lower(trim(serial_number)) = lower(trim(v_stock.serial_number))
              and id <> v_stock.id and quantity > 0 and status <> 'sold';
          if found then
            raise exception 'another active stock row already exists for serial % — resolve it before voiding', v_stock.serial_number;
          end if;
          update stock set status = 'available', quantity = 1,
            total_cost = cost_per_unit, return_date = current_date,
            updated_at = now() where id = v_stock.id;
        else
          update stock set quantity = quantity + v_remaining,
            status = 'available',
            total_cost = cost_per_unit * (quantity + v_remaining),
            return_date = current_date, updated_at = now() where id = v_stock.id;
        end if;
        insert into stock_movements (stock_id, movement_type, quantity, to_branch_id,
          reference_type, reference_id, actor_id, note)
        values (v_stock.id, 'return', v_remaining, v_sale.branch_id, 'sale', v_sale.id,
          auth.uid(), 'void: ' || v_reason);
      end if;
    end if;

    update sale_line_items set returned_quantity = v_line.quantity,
      return_date = current_date, after_sales_status = 'returned', updated_at = now()
      where id = v_line.id;
  end loop;

  update sales set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
    updated_at = now() where id = p_sale_id;

  select jsonb_build_object(
    'sale', to_jsonb(s.*), 'lines', coalesce((select jsonb_agg(to_jsonb(l)) from sale_line_items l
                        where l.sale_id = p_sale_id), '[]'::jsonb)
  ) into v_after
  from sales s where s.id = p_sale_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('sale', p_sale_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;
