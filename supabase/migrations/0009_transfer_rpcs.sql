alter table transfers add column request_id uuid references inventory_requests(id);
alter table transfer_line_items add column received_note text;

create or replace function transfer_reserve(p_transfer_id uuid)
returns void language plpgsql security invoker as $$
declare v_line record; v_stock record; v_new_id uuid;
begin
  perform 1 from transfers where id = p_transfer_id and status = 'draft' for update;
  if not found then raise exception 'transfer not in draft'; end if;

  for v_line in select * from transfer_line_items where transfer_id = p_transfer_id loop
    if v_line.stock_id is null then raise exception 'line % has no stock', v_line.id; end if;
    select * into v_stock from stock where id = v_line.stock_id for update;
    if not found then raise exception 'stock not found for line %', v_line.id; end if;
    if v_stock.status <> 'available' then
      raise exception 'stock % not available', coalesce(v_stock.serial_number, v_stock.id::text);
    end if;
    if v_line.quantity > v_stock.quantity then
      raise exception 'insufficient quantity for %', coalesce(v_stock.serial_number, v_stock.id::text);
    end if;
    if v_stock.serial_number is not null or v_line.quantity = v_stock.quantity then
      update stock set status = 'reserved', updated_at = now() where id = v_stock.id;
    else
      insert into stock (product_id, supplier_id, branch_id, quantity, original_quantity,
        status, cost_per_unit, total_cost, supplier_invoice_no, supplier_invoice_date,
        expiry_date, branch_date_received, is_repair_pool, is_office_asset)
      values (v_stock.product_id, v_stock.supplier_id, v_stock.branch_id, v_line.quantity,
        v_line.quantity, 'reserved', v_stock.cost_per_unit,
        v_stock.cost_per_unit * v_line.quantity, v_stock.supplier_invoice_no,
        v_stock.supplier_invoice_date, v_stock.expiry_date, v_stock.branch_date_received,
        v_stock.is_repair_pool, v_stock.is_office_asset)
      returning id into v_new_id;
      update stock set quantity = quantity - v_line.quantity,
        total_cost = cost_per_unit * (quantity - v_line.quantity), updated_at = now()
        where id = v_stock.id;
      update transfer_line_items set stock_id = v_new_id where id = v_line.id;
    end if;
  end loop;

  update transfers set status = 'reserved', updated_at = now() where id = p_transfer_id;
end $$;

create or replace function transfer_dispatch(
  p_transfer_id uuid, p_courier text, p_tracking_code text, p_sis_no text
) returns void language plpgsql security invoker as $$
declare v_line record; v_transfer transfers%rowtype;
begin
  select * into v_transfer from transfers where id = p_transfer_id and status = 'reserved' for update;
  if not found then raise exception 'transfer not reserved'; end if;

  for v_line in select * from transfer_line_items where transfer_id = p_transfer_id loop
    update stock set status = 'transferred', updated_at = now() where id = v_line.stock_id;
    insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
      to_branch_id, reference_type, reference_id, actor_id)
    values (v_line.stock_id, 'transfer_out', v_line.quantity, v_transfer.from_branch_id,
      v_transfer.to_branch_id, 'transfer', p_transfer_id, auth.uid());
  end loop;

  update transfers set status = 'in_transit', transfer_date = current_date,
    courier = p_courier, tracking_code = p_tracking_code, sis_no = p_sis_no,
    updated_at = now() where id = p_transfer_id;
end $$;

-- security definer: receiving branch must update stock rows still owned by the
-- sending branch (RLS would block the invoker). Explicit authorization below.
create or replace function transfer_receive_line(
  p_line_id uuid, p_confirm boolean, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_line transfer_line_items%rowtype; v_transfer transfers%rowtype; v_open int;
begin
  select * into v_line from transfer_line_items where id = p_line_id for update;
  if not found then raise exception 'line not found'; end if;
  select * into v_transfer from transfers where id = v_line.transfer_id for update;
  if not (auth_role() = 'admin' or auth_branch() = v_transfer.to_branch_id) then
    raise exception 'not authorized to receive this transfer';
  end if;
  if v_transfer.status <> 'in_transit' then raise exception 'transfer not in transit'; end if;
  if v_line.received_confirmed then raise exception 'line already received'; end if;

  if p_confirm then
    update stock set branch_id = v_transfer.to_branch_id, status = 'available',
      branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;
    insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
      to_branch_id, reference_type, reference_id, actor_id)
    values (v_line.stock_id, 'transfer_in', v_line.quantity, v_transfer.from_branch_id,
      v_transfer.to_branch_id, 'transfer', v_transfer.id, auth.uid());
    update transfer_line_items set received_confirmed = true, received_at = now(),
      received_note = p_note where id = p_line_id;
  else
    if p_note is null or length(trim(p_note)) = 0 then
      raise exception 'discrepancy note required';
    end if;
    update transfer_line_items set received_note = p_note where id = p_line_id;
  end if;

  select count(*) into v_open from transfer_line_items
    where transfer_id = v_transfer.id and received_confirmed = false and received_note is null;
  if v_open = 0 then
    update transfers set status = 'confirmed', received_date = current_date,
      updated_at = now() where id = v_transfer.id;
    if v_transfer.request_id is not null then
      update inventory_requests set status = 'served', updated_at = now()
        where id = v_transfer.request_id;
    end if;
  end if;
end $$;

create or replace function request_serve(p_request_id uuid, p_from_branch_id uuid)
returns uuid language plpgsql security invoker as $$
declare v_req inventory_requests%rowtype; v_id uuid; v_code text;
begin
  select * into v_req from inventory_requests where id = p_request_id
    and status = 'pending' for update;
  if not found then raise exception 'request not pending'; end if;
  if p_from_branch_id = v_req.requesting_branch_id then
    raise exception 'source branch must differ from requesting branch';
  end if;
  v_code := 'TR-' || to_char(current_date, 'YYMMDD') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 6));
  insert into transfers (code, from_branch_id, to_branch_id, status, request_id)
  values (v_code, p_from_branch_id, v_req.requesting_branch_id, 'draft', p_request_id)
  returning id into v_id;
  update inventory_requests set status = 'processing', updated_at = now()
    where id = p_request_id;
  return v_id;
end $$;
