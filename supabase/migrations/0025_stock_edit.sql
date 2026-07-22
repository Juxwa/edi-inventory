-- Phase 6b item 3: let admin fix mis-keyed product/model or invoice data
-- on a stock row after intake, without voiding it. Mirrors the audit-write
-- style of 0022_admin_corrections.sql exactly (security definer, explicit
-- admin guard, required reason, row lock, before/after jsonb snapshot).
--
-- Deliberately does NOT touch serial_number (use serial_correct, 0022) or
-- quantity (would desync the movement ledger — quantity corrections need
-- their own compensating movement, out of scope here).

create or replace function stock_edit(
  p_stock_id uuid, p_product_id uuid, p_cost_per_unit numeric,
  p_invoice_no text, p_invoice_date date, p_expiry_date date,
  p_is_repair_pool boolean, p_is_office_asset boolean, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_stock stock%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
  v_total_cost numeric;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;
  if p_product_id is null then raise exception 'product is required'; end if;

  select * into v_stock from stock where id = p_stock_id for update;
  if not found then raise exception 'stock not found'; end if;

  if v_stock.status not in
    ('available', 'reserved', 'under_repair', 'for_replacement', 'consignment')
  then
    raise exception 'stock has moved — use a correction instead';
  end if;

  v_before := to_jsonb(v_stock);

  -- Recompute total_cost from the (possibly new) cost_per_unit against the
  -- row's existing quantity; quantity itself is never changed here.
  v_total_cost := p_cost_per_unit * v_stock.quantity;

  update stock set
    product_id = p_product_id,
    cost_per_unit = p_cost_per_unit,
    total_cost = v_total_cost,
    supplier_invoice_no = p_invoice_no,
    supplier_invoice_date = p_invoice_date,
    expiry_date = p_expiry_date,
    is_repair_pool = coalesce(p_is_repair_pool, false),
    is_office_asset = coalesce(p_is_office_asset, false),
    updated_at = now()
  where id = p_stock_id;

  select to_jsonb(s.*) into v_after from stock s where s.id = p_stock_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('stock', p_stock_id, 'edit', v_before, v_after, v_reason, auth.uid());
end $$;
