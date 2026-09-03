-- Fix net-payable basis in the payments layer (0053).
--
-- 0053 computed: net = (vat_exempt ? gross / 1.12 : gross) - discount.
-- That's correct for SC/PWD (discount is computed off the VAT-removed base,
-- so payable = gross/1.12 - discount), but WRONG for every other VAT-exempt
-- sale — especially final_price mode, where discount = gross - final already
-- absorbs everything and payable must be exactly the typed final price.
-- Example seen live: gross 262,000, final 105,714.28 (discount 156,285.72),
-- VAT-exempt → 0053 showed net payable 77,642.85 (262,000/1.12 - discount):
-- VAT stripped twice.
--
-- Correct rule (mirrors computeDiscountAndVat in sales/actions.ts):
--   net = greatest(0, (discount_type in ('senior_citizen','pwd')
--                        ? gross / 1.12 : gross) - discount)
-- vat_exempt still zeroes the VAT figure; it never changes the payable base.

create or replace view sales_balances with (security_invoker = true) as
select sale_id, branch_id, sale_date, customer_id, or_no, csi_no, ci_no,
  gross, net_payable, paid,
  case when is_paid and paid = 0 then 0
       else greatest(0, net_payable - paid) end as balance
from (
  select s.id as sale_id, s.branch_id, s.sale_date, s.customer_id,
    s.or_no, s.csi_no, s.ci_no, s.is_paid,
    coalesce(l.gross, 0) as gross,
    greatest(0, round((case when s.discount_type in ('senior_citizen','pwd')
                            then coalesce(l.gross, 0) / 1.12
                            else coalesce(l.gross, 0) end) - s.discount, 2)) as net_payable,
    coalesce(p.paid, 0) as paid
  from sales s
  left join (select sale_id, sum(unit_price * quantity) as gross
             from sale_line_items group by sale_id) l on l.sale_id = s.id
  left join (select sale_id, sum(amount) as paid
             from sale_payments group by sale_id) p on p.sale_id = s.id
  where s.voided_at is null
) x;

create or replace function sale_add_payment(
  p_sale_id uuid, p_amount numeric, p_payment_date date default null,
  p_or_no text default null, p_method text default null, p_note text default null
) returns uuid language plpgsql security invoker as $$
declare
  v_sale sales%rowtype; v_gross numeric; v_net numeric; v_paid numeric;
  v_balance numeric; v_amount numeric; v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;
  v_amount := round(p_amount, 2);

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found'; end if;
  if v_sale.voided_at is not null then
    raise exception 'cannot record a payment on a voided sale';
  end if;

  select coalesce(sum(unit_price * quantity), 0) into v_gross
    from sale_line_items where sale_id = p_sale_id;
  v_net := greatest(0, round((case when v_sale.discount_type in ('senior_citizen','pwd')
                                   then v_gross / 1.12
                                   else v_gross end) - v_sale.discount, 2));
  select coalesce(sum(amount), 0) into v_paid
    from sale_payments where sale_id = p_sale_id;

  v_balance := case when v_sale.is_paid and v_paid = 0 then 0
                    else greatest(0, v_net - v_paid) end;
  if v_amount > v_balance + 0.01 then
    raise exception 'payment (%) exceeds the remaining balance (%)', v_amount, v_balance;
  end if;

  insert into sale_payments (sale_id, amount, payment_date, or_no, method, note, received_by)
  values (p_sale_id, v_amount, coalesce(p_payment_date, current_date),
          nullif(trim(p_or_no), ''), nullif(trim(p_method), ''),
          nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  update sales set is_paid = (v_paid + v_amount >= v_net - 0.01), updated_at = now()
    where id = p_sale_id;

  return v_id;
end $$;

create or replace function sale_delete_payment(p_payment_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_sale sales%rowtype; v_sale_id uuid; v_gross numeric; v_net numeric; v_paid numeric;
begin
  if auth_role() <> 'admin' then
    raise exception 'only admins can delete payments';
  end if;

  select sale_id into v_sale_id from sale_payments where id = p_payment_id;
  if not found then raise exception 'payment not found'; end if;

  select * into v_sale from sales where id = v_sale_id for update;
  delete from sale_payments where id = p_payment_id;

  select coalesce(sum(unit_price * quantity), 0) into v_gross
    from sale_line_items where sale_id = v_sale_id;
  v_net := greatest(0, round((case when v_sale.discount_type in ('senior_citizen','pwd')
                                   then v_gross / 1.12
                                   else v_gross end) - v_sale.discount, 2));
  select coalesce(sum(amount), 0) into v_paid
    from sale_payments where sale_id = v_sale_id;

  update sales set is_paid = (v_paid > 0 and v_paid >= v_net - 0.01), updated_at = now()
    where id = v_sale_id;
end $$;
