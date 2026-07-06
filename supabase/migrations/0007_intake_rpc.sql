create function stock_intake(
  p_product_id uuid, p_branch_id uuid, p_supplier_id uuid,
  p_serials text[], p_quantity numeric, p_cost_per_unit numeric,
  p_invoice_no text, p_invoice_date date, p_expiry_date date,
  p_repair_pool boolean default false, p_office_asset boolean default false
) returns setof uuid language plpgsql as $$
declare v_id uuid; v_serial text;
begin
  if p_serials is not null and array_length(p_serials, 1) > 0 then
    foreach v_serial in array p_serials loop
      insert into stock (product_id, branch_id, supplier_id, quantity, original_quantity,
        serial_number, status, cost_per_unit, total_cost, supplier_invoice_no,
        supplier_invoice_date, expiry_date, branch_date_received, is_repair_pool, is_office_asset)
      values (p_product_id, p_branch_id, p_supplier_id, 1, 1, v_serial, 'available',
        p_cost_per_unit, p_cost_per_unit, p_invoice_no, p_invoice_date, p_expiry_date,
        current_date, p_repair_pool, p_office_asset)
      returning id into v_id;
      insert into stock_movements (stock_id, movement_type, quantity, to_branch_id, actor_id)
      values (v_id, 'intake', 1, p_branch_id, auth.uid());
      return next v_id;
    end loop;
  else
    insert into stock (product_id, branch_id, supplier_id, quantity, original_quantity,
      status, cost_per_unit, total_cost, supplier_invoice_no, supplier_invoice_date,
      expiry_date, branch_date_received, is_repair_pool, is_office_asset)
    values (p_product_id, p_branch_id, p_supplier_id, p_quantity, p_quantity, 'available',
      p_cost_per_unit, p_cost_per_unit * p_quantity, p_invoice_no, p_invoice_date,
      p_expiry_date, current_date, p_repair_pool, p_office_asset)
    returning id into v_id;
    insert into stock_movements (stock_id, movement_type, quantity, to_branch_id, actor_id)
    values (v_id, 'intake', p_quantity, p_branch_id, auth.uid());
    return next v_id;
  end if;
end $$;
