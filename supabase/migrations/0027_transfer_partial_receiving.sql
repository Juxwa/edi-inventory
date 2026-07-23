-- Phase 6c item B: quantity-aware transfer receiving. Replaces the
-- confirm/discrepancy-note-only transfer_receive_line with a version that
-- records how many units actually arrived and splits the stock accordingly.
--
-- How dispatch/reserve leave stock (verified from 0009_transfer_rpcs.sql):
--   transfer_reserve: for a full-row line, the existing stock row is marked
--     'reserved' in place (branch_id unchanged, still at the origin
--     branch). For a partial-quantity line it splits off a NEW stock row at
--     the origin branch with quantity = line.quantity, status 'reserved',
--     and points the line at that new row.
--   transfer_dispatch: marks that same stock row 'transferred' (branch_id
--     still the origin branch — it is never moved to the destination at
--     dispatch time).
-- So while in_transit, transfer_line_items.stock_id always points at a row
-- physically "at" the origin branch_id with status 'transferred' and
-- quantity = line.quantity. Receiving is what finally moves it.

alter table transfer_line_items add column if not exists received_quantity numeric;

drop function if exists transfer_receive_line(uuid, boolean, text);

-- security definer: receiving branch must update stock rows still owned by
-- the sending branch (RLS would block the invoker). Explicit authorization
-- below, unchanged from the previous version.
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

  if v_line.stock_id is null then raise exception 'line % has no stock', v_line.id; end if;
  select * into v_stock from stock where id = v_line.stock_id for update;
  if not found then raise exception 'stock not found for line %', v_line.id; end if;

  v_shortfall := v_line.quantity - p_received_quantity;

  if p_received_quantity = v_line.quantity then
    -- Full receipt: the whole in-transit row lands at the destination.
    update stock set branch_id = v_transfer.to_branch_id, status = 'available',
      branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
    insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
      to_branch_id, reference_type, reference_id, actor_id, note)
    values (v_line.stock_id, 'transfer_in', p_received_quantity, v_transfer.from_branch_id,
      v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid(), v_note);

  elsif p_received_quantity = 0 then
    -- Nothing arrived: the whole row returns to the origin as available.
    update stock set branch_id = v_transfer.from_branch_id, status = 'available',
      branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
    insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
      to_branch_id, reference_type, reference_id, actor_id, note)
    values (v_line.stock_id, 'transfer_in', v_line.quantity, v_transfer.to_branch_id,
      v_transfer.from_branch_id, 'transfer', v_transfer.id, auth.uid(),
      'shortfall returned to origin: ' || v_note);

  else
    -- Partial: split. The received portion moves to the destination on the
    -- existing row; the shortfall is spun off as a new available row back
    -- at the origin. Units before == units after (destination + origin).
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
