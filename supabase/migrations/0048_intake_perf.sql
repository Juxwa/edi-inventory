-- Bulk intake of 240 serials timed out: the duplicate-serial guard (0026)
-- ran one un-indexed scan per serial against ~20k stock rows. Two fixes:
-- a functional index on the normalized serial, and a single set-based
-- conflict check instead of a per-serial loop.

create index if not exists stock_serial_lookup
  on stock (lower(trim(serial_number)))
  where serial_number is not null;

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
  v_conflicts text[];
  v_total int;
begin
  if p_serials is not null and array_length(p_serials, 1) > 0 then
    -- Trim + drop empties, then dedupe the incoming batch.
    select array_agg(distinct s) into v_serials
    from (select trim(x) as s from unnest(p_serials) as x) t
    where s <> '';

    if v_serials is null or array_length(v_serials, 1) = 0 then
      raise exception 'no valid serial numbers submitted';
    end if;
    v_total := array_length(v_serials, 1);

    -- One set-based pass: every conflicting serial with its location/status.
    select array_agg(conflict order by conflict) into v_conflicts
    from (
      select distinct incoming.s || ' (already at ' || b.name || ', ' || st.status || ')' as conflict
      from unnest(v_serials) as incoming(s)
      join stock st on st.serial_number is not null
        and lower(trim(st.serial_number)) = lower(incoming.s)
      join branches b on b.id = st.branch_id
    ) t;

    if v_conflicts is not null and array_length(v_conflicts, 1) > 0 then
      raise exception 'Nothing was saved. % of % serial(s) are already in stock: %',
        array_length(v_conflicts, 1), v_total, array_to_string(v_conflicts, '; ');
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
