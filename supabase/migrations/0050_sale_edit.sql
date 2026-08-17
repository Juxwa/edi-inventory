-- Admin-only audited edit of a sale's non-money header fields (OR/CSI/CI
-- no., sale date, customer, referred by, paid flag). Mirrors stock_edit
-- (0025_stock_edit.sql) exactly: security definer, explicit admin guard,
-- required reason, `for update` row lock, admin_corrections before/after
-- jsonb write.
--
-- Deliberately does NOT touch discount, vat_amount, vat_exempt,
-- discount_type, discount_id_no, line items, branch_id, or sold_by — those
-- are money/branch-attribution fields out of scope here. Refuses voided
-- sales (use serial_correct/other tooling is not applicable; a void must be
-- reversed by re-recording, not edited).

create or replace function sale_edit(
  p_sale_id uuid, p_or_no text, p_csi_no text, p_ci_no text,
  p_sale_date date, p_customer_id uuid, p_referred_by text,
  p_is_paid boolean, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale sales%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;
  if p_sale_date is null then raise exception 'sale date is required'; end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found'; end if;
  if v_sale.voided_at is not null then raise exception 'sale is voided'; end if;

  if p_customer_id is not null
     and not exists (select 1 from customers where id = p_customer_id)
  then
    raise exception 'customer not found';
  end if;

  v_before := jsonb_build_object(
    'or_no', v_sale.or_no,
    'csi_no', v_sale.csi_no,
    'ci_no', v_sale.ci_no,
    'sale_date', v_sale.sale_date,
    'customer_id', v_sale.customer_id,
    'referred_by', v_sale.referred_by,
    'is_paid', v_sale.is_paid
  );

  update sales set
    or_no = p_or_no,
    csi_no = p_csi_no,
    ci_no = p_ci_no,
    sale_date = p_sale_date,
    customer_id = p_customer_id,
    referred_by = p_referred_by,
    is_paid = coalesce(p_is_paid, false),
    updated_at = now()
  where id = p_sale_id;

  select jsonb_build_object(
    'or_no', s.or_no,
    'csi_no', s.csi_no,
    'ci_no', s.ci_no,
    'sale_date', s.sale_date,
    'customer_id', s.customer_id,
    'referred_by', s.referred_by,
    'is_paid', s.is_paid
  ) into v_after from sales s where s.id = p_sale_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('sale', p_sale_id, 'edit', v_before, v_after, v_reason, auth.uid());
end $$;
