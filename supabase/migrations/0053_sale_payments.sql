-- Partial payments on sales (client need: downpayment at sale time, final
-- payment later — sometimes more than two installments).
--
-- The sale itself is unchanged: recorded once, stock deducted once. Money
-- arrives as sale_payments rows, each with its own OR number (BIR practice:
-- one OR per payment received). sales.is_paid becomes derived: the
-- sale_add_payment / sale_delete_payment RPCs recompute it against net
-- payable after every change. A sale marked is_paid at creation with no
-- payment rows still counts as settled (balance 0) — that's the pre-existing
-- "paid in full at the counter" flow and is left untouched.
--
-- Net payable formula matches the sales list page (src/app/(app)/sales/
-- page.tsx): net = max(0, (vat_exempt ? gross / 1.12 : gross) - discount).
--
-- sales_balances view feeds the "with balance" (receivables) filter and the
-- balance column. security_invoker so the caller's RLS on sales applies.

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  or_no text,
  method text,
  note text,
  received_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_sp_sale on sale_payments(sale_id);

alter table sale_payments enable row level security;

create policy sp_read on sale_payments for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id
    and (auth_role() in ('admin','top_mgmt') or s.branch_id = auth_branch())));

create policy sp_insert on sale_payments for insert to authenticated
  with check (exists (select 1 from sales s where s.id = sale_id
    and (auth_role() = 'admin' or s.branch_id = auth_branch())));

create policy sp_delete on sale_payments for delete to authenticated
  using (auth_role() = 'admin');

create or replace view sales_balances with (security_invoker = true) as
select sale_id, branch_id, sale_date, customer_id, or_no, csi_no, ci_no,
  gross, net_payable, paid,
  case when is_paid and paid = 0 then 0
       else greatest(0, net_payable - paid) end as balance
from (
  select s.id as sale_id, s.branch_id, s.sale_date, s.customer_id,
    s.or_no, s.csi_no, s.ci_no, s.is_paid,
    coalesce(l.gross, 0) as gross,
    greatest(0, round((case when s.vat_exempt then coalesce(l.gross, 0) / 1.12
                            else coalesce(l.gross, 0) end) - s.discount, 2)) as net_payable,
    coalesce(p.paid, 0) as paid
  from sales s
  left join (select sale_id, sum(unit_price * quantity) as gross
             from sale_line_items group by sale_id) l on l.sale_id = s.id
  left join (select sale_id, sum(amount) as paid
             from sale_payments group by sale_id) p on p.sale_id = s.id
  where s.voided_at is null
) x;

grant select on sales_balances to authenticated;

-- Records one payment against a sale. Rejects voided sales and amounts
-- beyond the remaining balance (1-centavo tolerance for rounding). Flips
-- sales.is_paid when the balance reaches zero. security invoker: RLS on
-- sale_payments/sales enforces who can write, on top of the app-level
-- role check in the server action.
create function sale_add_payment(
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
  v_net := greatest(0, round((case when v_sale.vat_exempt then v_gross / 1.12
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

-- Admin-only mistake correction. Recomputes is_paid from the remaining
-- payments: true only if payments remain and they cover net payable.
create function sale_delete_payment(p_payment_id uuid)
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
  v_net := greatest(0, round((case when v_sale.vat_exempt then v_gross / 1.12
                                   else v_gross end) - v_sale.discount, 2));
  select coalesce(sum(amount), 0) into v_paid
    from sale_payments where sale_id = v_sale_id;

  update sales set is_paid = (v_paid > 0 and v_paid >= v_net - 0.01), updated_at = now()
    where id = v_sale_id;
end $$;
