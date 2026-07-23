-- stock_intake previously raised on the FIRST duplicate serial it found, so a
-- batch with several conflicts had to be retried once per conflict. Collect
-- every offending serial and report them together. Behaviour is otherwise
-- unchanged: all serials are validated before any insert, so a rejected batch
-- writes nothing.

create or replace function stock_intake(
  p_product_id uuid, p_branch_id uuid, p_supplier_id uuid,
  p_serials text[], p_quantity numeric, p_cost_per_unit numeric,
  p_invoice_no text, p_invoice_date date, p_expiry_date date,
  p_repair_pool boolean default false, p_office_asset boolean default false
) returns setof uuid language plpgsql as $$
declare
  v_id uuid;
  v_serial text;
  v_serials text[];
  v_conflicts text[] := '{}';
  v_conflict text;
begin
  if p_serials is not null and array_length(p_serials, 1) > 0 then
    -- Trim + drop empties, then dedupe the incoming batch so a serial
    -- repeated within one submission counts once.
    select array_agg(distinct s) into v_serials
    from (select trim(x) as s from unnest(p_serials) as x) t
    where s <> '';

    if v_serials is null or array_length(v_serials, 1) = 0 then
      raise exception 'no valid serial numbers submitted';
    end if;

    -- Gather every conflict first, then report them all at once.
    foreach v_serial in array v_serials loop
      select v_serial || ' (already at ' || b.name || ', ' || st.status || ')'
        into v_conflict
      from stock st
      join branches b on b.id = st.branch_id
      where st.serial_number is not null
        and lower(trim(st.serial_number)) = lower(v_serial)
      limit 1;

      if v_conflict is not null then
        v_conflicts := array_append(v_conflicts, v_conflict);
        v_conflict := null;
      end if;
    end loop;

    if array_length(v_conflicts, 1) > 0 then
      raise exception 'Nothing was saved. % of % serial(s) are already in stock: %',
        array_length(v_conflicts, 1),
        array_length(v_serials, 1),
        array_to_string(v_conflicts, '; ');
    end if;

    foreach v_serial in array v_serials loop
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
