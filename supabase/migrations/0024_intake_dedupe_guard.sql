-- Phase 6b item 1 (BUG): stock_intake inserted every submitted serial with
-- no uniqueness check, and there is no unique constraint on
-- stock.serial_number anywhere. Scanning/pasting the same serial twice, or
-- re-running an intake, silently created duplicate stock rows.
--
-- Deliberately NOT adding a hard unique constraint on stock.serial_number:
-- imported legacy data may already contain duplicates and the migration
-- would fail outright. Use this later for cleanup once the client has
-- worked through the /admin/duplicates list:
--
--   select serial_number, count(*)
--   from stock
--   where serial_number is not null
--   group by 1
--   having count(*) > 1;

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
  v_dup_id uuid;
  v_dup_status stock.status%type;
  v_dup_branch_name text;
begin
  if p_serials is not null and array_length(p_serials, 1) > 0 then
    -- Trim + drop empties, then dedupe the incoming batch so a serial
    -- repeated within one submission counts once rather than being
    -- inserted (and then rejected against itself) twice.
    select array_agg(distinct s) into v_serials
    from (select trim(x) as s from unnest(p_serials) as x) t
    where s <> '';

    if v_serials is null or array_length(v_serials, 1) = 0 then
      raise exception 'no valid serial numbers submitted';
    end if;

    -- Check ALL serials against existing stock before inserting any, so a
    -- bad batch fails cleanly rather than half-importing.
    foreach v_serial in array v_serials loop
      v_dup_id := null;
      select st.id, st.status, b.name
        into v_dup_id, v_dup_status, v_dup_branch_name
      from stock st
      join branches b on b.id = st.branch_id
      where st.serial_number is not null
        and lower(trim(st.serial_number)) = lower(v_serial)
      limit 1;

      if v_dup_id is not null then
        raise exception 'serial % already in stock at % (%)',
          v_serial, v_dup_branch_name, v_dup_status;
      end if;
    end loop;

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

-- Admin-facing cleanup list: every stock row whose (trimmed, case-
-- insensitive) serial number collides with at least one other stock row.
-- security_invoker = on so it rides the existing admin/top_mgmt-only
-- `stock_read` policy (0010) rather than needing its own role check.
create or replace view stock_duplicate_serials with (security_invoker = on) as
select s.id, s.serial_number, s.product_id, s.branch_id, s.status,
       s.quantity, s.branch_date_received, s.created_at
from stock s
where s.serial_number is not null
  and trim(s.serial_number) <> ''
  and exists (
    select 1 from stock s2
    where s2.id <> s.id
      and s2.serial_number is not null
      and lower(trim(s2.serial_number)) = lower(trim(s.serial_number))
  )
order by lower(trim(s.serial_number)), s.created_at;

grant select on stock_duplicate_serials to authenticated;
revoke select on stock_duplicate_serials from anon;
