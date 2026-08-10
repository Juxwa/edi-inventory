-- Bug: imported in-transit transfers (legacy Bubble codes) can carry lines
-- whose stock could not be matched during import (stock_id null — 1,388 such
-- lines). transfer_receive_line raised 'line has no stock', making those
-- transfers impossible to accept.
--
-- Fix: when a line has no stock link but has a product snapshot, receiving
-- materialises the stock at the destination:
--   * serialized (serial_snapshot present): if exactly one ACTIVE stock row
--     already carries that serial, relink and move it (prevents duplicates);
--     if none, create the row at the destination; if several, raise — that
--     serial needs the duplicate cleanup first.
--   * lot (no serial): create a lot row at the destination for the received
--     quantity. Cost unknown (legacy) — left null, movement note flags it.
-- Shortfalls on unlinked lines don't return stock to origin (no origin row
-- ever existed in this system); the note records the discrepancy.

create or replace function transfer_receive_line(
  p_line_id uuid, p_received_quantity numeric, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_line transfer_line_items%rowtype;
  v_transfer transfers%rowtype;
  v_stock stock%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_shortfall numeric;
  v_return_stock_id uuid;
  v_open int;
  v_serial text;
  v_match_count int;
  v_new_id uuid;
begin
  select * into v_line from transfer_line_items where id = p_line_id for update;
  if not found then raise exception 'line not found'; end if;
  select * into v_transfer from transfers where id = v_line.transfer_id for update;
  if not (auth_role() = 'admin' or auth_branch() = v_transfer.to_branch_id) then
    raise exception 'not authorized to receive this transfer';
  end if;
  if v_transfer.status <> 'in_transit' then raise exception 'transfer not in transit'; end if;
  if v_line.received_confirmed then raise exception 'line already received'; end if;

  if p_received_quantity is null then raise exception 'received quantity required'; end if;
  if p_received_quantity < 0 or p_received_quantity > v_line.quantity then
    raise exception 'received quantity must be between 0 and %', v_line.quantity;
  end if;
  if p_received_quantity <> v_line.quantity and v_note is null then
    raise exception 'discrepancy note required';
  end if;

  -- Legacy unlinked line: no stock row was matched at import time.
  if v_line.stock_id is null then
    if v_line.product_id is null then
      raise exception 'line has neither stock nor product reference — correct it via admin before receiving';
    end if;

    v_serial := nullif(trim(coalesce(v_line.serial_snapshot, '')), '');

    if v_serial is not null then
      select count(*) into v_match_count from stock s
      where s.serial_number is not null
        and lower(trim(s.serial_number)) = lower(v_serial)
        and s.quantity > 0 and s.status <> 'sold';

      if v_match_count > 1 then
        raise exception 'serial % exists on multiple active stock rows — run duplicate cleanup first', v_serial;
      elsif v_match_count = 1 then
        -- Relink and move the existing unit rather than creating a twin.
        select * into v_stock from stock s
        where s.serial_number is not null
          and lower(trim(s.serial_number)) = lower(v_serial)
          and s.quantity > 0 and s.status <> 'sold'
        for update;
        update transfer_line_items set stock_id = v_stock.id where id = p_line_id;

        if p_received_quantity >= 1 then
          update stock set branch_id = v_transfer.to_branch_id, status = 'available',
            branch_date_received = current_date, updated_at = now() where id = v_stock.id;
          insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
            to_branch_id, reference_type, reference_id, actor_id, note)
          values (v_stock.id, 'transfer_in', 1, v_transfer.from_branch_id,
            v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(),
            coalesce(v_note, 'legacy line relinked on receive'));
        end if;
      else
        if p_received_quantity >= 1 then
          insert into stock (product_id, branch_id, quantity, original_quantity,
            serial_number, status, branch_date_received)
          values (v_line.product_id, v_transfer.to_branch_id, 1, 1, v_serial,
            'available', current_date)
          returning id into v_new_id;
          update transfer_line_items set stock_id = v_new_id where id = p_line_id;
          insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
            to_branch_id, reference_type, reference_id, actor_id, note)
          values (v_new_id, 'transfer_in', 1, v_transfer.from_branch_id,
            v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(),
            coalesce(v_note, 'legacy line: stock created at receive (cost unknown)'));
        end if;
      end if;
    else
      if p_received_quantity > 0 then
        insert into stock (product_id, branch_id, quantity, original_quantity,
          status, branch_date_received)
        values (v_line.product_id, v_transfer.to_branch_id, p_received_quantity,
          p_received_quantity, 'available', current_date)
        returning id into v_new_id;
        update transfer_line_items set stock_id = v_new_id where id = p_line_id;
        insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
          to_branch_id, reference_type, reference_id, actor_id, note)
        values (v_new_id, 'transfer_in', p_received_quantity, v_transfer.from_branch_id,
          v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(),
          coalesce(v_note, 'legacy line: lot created at receive (cost unknown)'));
      end if;
    end if;

    update transfer_line_items set received_quantity = p_received_quantity,
      received_confirmed = true, received_at = now(),
      received_note = coalesce(received_note, v_note)
      where id = p_line_id;

  else
    -- Normal path: unchanged from 0027.
    select * into v_stock from stock where id = v_line.stock_id for update;
    if not found then raise exception 'stock not found for line %', v_line.id; end if;

    v_shortfall := v_line.quantity - p_received_quantity;

    if p_received_quantity = v_line.quantity then
      update stock set branch_id = v_transfer.to_branch_id, status = 'available',
        branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_line.stock_id, 'transfer_in', p_received_quantity, v_transfer.from_branch_id,
        v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(), v_note);

    elsif p_received_quantity = 0 then
      update stock set branch_id = v_transfer.from_branch_id, status = 'available',
        branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_line.stock_id, 'transfer_in', v_line.quantity, v_transfer.to_branch_id,
        v_transfer.from_branch_id, 'transfer', v_transfer.id, auth.uid(),
        'shortfall returned to origin: ' || v_note);

    else
      update stock set quantity = p_received_quantity,
        total_cost = cost_per_unit * p_received_quantity,
        branch_id = v_transfer.to_branch_id, status = 'available',
        branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_line.stock_id, 'transfer_in', p_received_quantity, v_transfer.from_branch_id,
        v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(), v_note);

      insert into stock (product_id, supplier_id, branch_id, quantity, original_quantity,
        status, cost_per_unit, total_cost, supplier_invoice_no, supplier_invoice_date,
        expiry_date, branch_date_received, is_repair_pool, is_office_asset)
      values (v_stock.product_id, v_stock.supplier_id, v_transfer.from_branch_id, v_shortfall,
        v_shortfall, 'available', v_stock.cost_per_unit, v_stock.cost_per_unit * v_shortfall,
        v_stock.supplier_invoice_no, v_stock.supplier_invoice_date, v_stock.expiry_date,
        current_date, v_stock.is_repair_pool, v_stock.is_office_asset)
      returning id into v_return_stock_id;

      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_return_stock_id, 'transfer_in', v_shortfall, v_transfer.to_branch_id,
        v_transfer.from_branch_id, 'transfer', v_transfer.id, auth.uid(),
        'shortfall returned to origin: ' || v_note);
    end if;

    update transfer_line_items set received_quantity = p_received_quantity,
      received_confirmed = true, received_at = now(), received_note = v_note
      where id = p_line_id;
  end if;

  select count(*) into v_open from transfer_line_items
    where transfer_id = v_transfer.id and received_confirmed = false;
  if v_open = 0 then
    update transfers set status = 'confirmed', received_date = current_date,
      updated_at = now() where id = v_transfer.id;
    if v_transfer.request_id is not null then
      update inventory_requests set status = 'served', updated_at = now()
        where id = v_transfer.request_id;
    end if;
  end if;
end $$;
