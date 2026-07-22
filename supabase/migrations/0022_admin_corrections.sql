-- Phase 6 item 3: admin reversal (void) + serial correction, fully audited.
-- Every RPC here is security definer with an explicit admin guard at the top
-- (belt-and-braces alongside RLS, matching transfer_receive_line /
-- sale_return_line), requires a non-empty reason, and writes an
-- admin_corrections row with before/after jsonb snapshots. Row locks
-- (`for update`) guard every mutated row against double-void races.

create table admin_corrections (
  id bigserial primary key,
  entity text not null,          -- 'sale' | 'stock_intake' | 'transfer' | 'repair' | 'earmold' | 'serial'
  entity_id uuid not null,
  action text not null,          -- 'void' | 'edit'
  before_data jsonb,
  after_data jsonb,
  reason text not null,
  actor_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_admin_corrections_entity on admin_corrections(entity, entity_id);
create index idx_admin_corrections_created on admin_corrections(created_at desc);

alter table admin_corrections enable row level security;
create policy corrections_admin on admin_corrections for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

alter table sales
  add column voided_at timestamptz,
  add column voided_by uuid references profiles(id),
  add column void_reason text;

alter table repair_requests
  add column voided_at timestamptz,
  add column void_reason text;

alter table earmold_requests
  add column voided_at timestamptz,
  add column void_reason text;

alter table transfers
  add column reversed_at timestamptz,
  add column reversed_by uuid references profiles(id),
  add column reverse_reason text;

-- ---------------------------------------------------------------------
-- sale_void: mirrors sale_return_line's restore-stock math for every
-- stock line not already fully returned, then stamps the sale voided.
-- ---------------------------------------------------------------------
create or replace function sale_void(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale sales%rowtype;
  v_line sale_line_items%rowtype;
  v_stock stock%rowtype;
  v_remaining numeric;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found'; end if;
  if v_sale.voided_at is not null then raise exception 'sale already voided'; end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from sale_line_items l
                        where l.sale_id = p_sale_id), '[]'::jsonb)
  ) into v_before;

  for v_line in
    select * from sale_line_items
    where sale_id = p_sale_id and line_type = 'stock' and after_sales_status <> 'returned'
    for update
  loop
    v_remaining := v_line.quantity - coalesce(v_line.returned_quantity, 0);
    if v_remaining > 0 and v_line.stock_id is not null then
      select * into v_stock from stock where id = v_line.stock_id for update;
      if found then
        if v_stock.serial_number is not null then
          update stock set status = 'available', return_date = current_date,
            updated_at = now() where id = v_stock.id;
        else
          update stock set quantity = quantity + v_remaining,
            status = 'available',
            total_cost = cost_per_unit * (quantity + v_remaining),
            return_date = current_date, updated_at = now() where id = v_stock.id;
        end if;
        insert into stock_movements (stock_id, movement_type, quantity, to_branch_id,
          reference_type, reference_id, actor_id, note)
        values (v_stock.id, 'return', v_remaining, v_sale.branch_id, 'sale', v_sale.id,
          auth.uid(), 'void: ' || v_reason);
      end if;
    end if;

    update sale_line_items set returned_quantity = v_line.quantity,
      return_date = current_date, after_sales_status = 'returned', updated_at = now()
      where id = v_line.id;
  end loop;

  update sales set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
    updated_at = now() where id = p_sale_id;

  select jsonb_build_object(
    'sale', to_jsonb(s.*), 'lines', coalesce((select jsonb_agg(to_jsonb(l)) from sale_line_items l
                        where l.sale_id = p_sale_id), '[]'::jsonb)
  ) into v_after from sales s where s.id = p_sale_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('sale', p_sale_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- intake_void: only for stock rows that are still exactly as intaken.
-- ---------------------------------------------------------------------
create or replace function intake_void(p_stock_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_stock stock%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_activity_count int;
  v_before jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_stock from stock where id = p_stock_id for update;
  if not found then raise exception 'stock not found'; end if;

  select count(*) into v_activity_count from stock_movements
    where stock_id = p_stock_id and movement_type <> 'intake';

  if v_activity_count > 0
     or exists (select 1 from sale_line_items where stock_id = p_stock_id)
     or exists (select 1 from transfer_line_items where stock_id = p_stock_id)
     or v_stock.original_quantity is null
     or v_stock.quantity <> v_stock.original_quantity
  then
    raise exception 'stock has activity — cannot void';
  end if;

  v_before := to_jsonb(v_stock);

  delete from stock_movements where stock_id = p_stock_id and movement_type = 'intake';
  delete from stock where id = p_stock_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('stock_intake', p_stock_id, 'void', v_before, null, v_reason, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- transfer_reverse: confirmed transfers only. Moves stock back to the
-- origin branch with compensating movements. Status stays 'confirmed' —
-- history stays truthful — the reversal is recorded via the new columns.
-- ---------------------------------------------------------------------
create or replace function transfer_reverse(p_transfer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_transfer transfers%rowtype;
  v_line transfer_line_items%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_transfer from transfers where id = p_transfer_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if v_transfer.status <> 'confirmed' then raise exception 'transfer not confirmed'; end if;
  if v_transfer.reversed_at is not null then raise exception 'transfer already reversed'; end if;

  select jsonb_build_object(
    'transfer', to_jsonb(v_transfer),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from transfer_line_items l
                        where l.transfer_id = p_transfer_id), '[]'::jsonb)
  ) into v_before;

  for v_line in select * from transfer_line_items where transfer_id = p_transfer_id for update loop
    if v_line.stock_id is not null then
      perform 1 from stock where id = v_line.stock_id for update;
      update stock set branch_id = v_transfer.from_branch_id, status = 'available',
        branch_date_received = current_date, updated_at = now() where id = v_line.stock_id;

      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_line.stock_id, 'transfer_out', v_line.quantity, v_transfer.to_branch_id,
        v_transfer.from_branch_id, 'transfer', v_transfer.id, auth.uid(),
        'reversal: ' || v_reason);
      insert into stock_movements (stock_id, movement_type, quantity, from_branch_id,
        to_branch_id, reference_type, reference_id, actor_id, note)
      values (v_line.stock_id, 'transfer_in', v_line.quantity, v_transfer.to_branch_id,
        v_transfer.from_branch_id, 'transfer', v_transfer.id, auth.uid(),
        'reversal: ' || v_reason);
    end if;
  end loop;

  update transfers set reversed_at = now(), reversed_by = auth.uid(),
    reverse_reason = v_reason, updated_at = now() where id = p_transfer_id;

  select jsonb_build_object(
    'transfer', to_jsonb(t.*), 'lines', coalesce((select jsonb_agg(to_jsonb(l)) from transfer_line_items l
                        where l.transfer_id = p_transfer_id), '[]'::jsonb)
  ) into v_after from transfers t where t.id = p_transfer_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('transfer', p_transfer_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- serial_correct: fixes a mistyped serial in place. For scope 'stock'
-- also refreshes serial_snapshot on any sale/transfer lines pointing at
-- it, and rejects a new value that collides with an existing stock
-- serial. For scope 'repair', only repairs holding their own manual
-- serial (no linked sale line) are correctable here — a repair linked to
-- a sale line inherits its serial from that line; correct it via scope
-- 'sale_line' (or 'stock', which cascades to the line) instead.
-- ---------------------------------------------------------------------
create or replace function serial_correct(
  p_scope text, p_id uuid, p_new_serial text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_new_serial text := trim(coalesce(p_new_serial, ''));
  v_stock stock%rowtype;
  v_sale_line sale_line_items%rowtype;
  v_transfer_line transfer_line_items%rowtype;
  v_repair repair_requests%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;
  if length(v_new_serial) = 0 then raise exception 'new serial required'; end if;

  if p_scope = 'stock' then
    select * into v_stock from stock where id = p_id for update;
    if not found then raise exception 'stock not found'; end if;
    if exists (select 1 from stock where serial_number = v_new_serial and id <> p_id) then
      raise exception 'serial already in use';
    end if;

    v_before := jsonb_build_object('scope', p_scope, 'row', to_jsonb(v_stock));

    update stock set serial_number = v_new_serial, updated_at = now() where id = p_id;
    update sale_line_items set serial_snapshot = v_new_serial, updated_at = now()
      where stock_id = p_id;
    update transfer_line_items set serial_snapshot = v_new_serial where stock_id = p_id;

    select jsonb_build_object('scope', p_scope, 'row', to_jsonb(s.*)) into v_after
      from stock s where s.id = p_id;

  elsif p_scope = 'sale_line' then
    select * into v_sale_line from sale_line_items where id = p_id for update;
    if not found then raise exception 'sale line not found'; end if;

    v_before := jsonb_build_object('scope', p_scope, 'row', to_jsonb(v_sale_line));
    update sale_line_items set serial_snapshot = v_new_serial, updated_at = now() where id = p_id;
    select jsonb_build_object('scope', p_scope, 'row', to_jsonb(l.*)) into v_after
      from sale_line_items l where l.id = p_id;

  elsif p_scope = 'transfer_line' then
    select * into v_transfer_line from transfer_line_items where id = p_id for update;
    if not found then raise exception 'transfer line not found'; end if;

    v_before := jsonb_build_object('scope', p_scope, 'row', to_jsonb(v_transfer_line));
    update transfer_line_items set serial_snapshot = v_new_serial where id = p_id;
    select jsonb_build_object('scope', p_scope, 'row', to_jsonb(l.*)) into v_after
      from transfer_line_items l where l.id = p_id;

  elsif p_scope = 'repair' then
    select * into v_repair from repair_requests where id = p_id for update;
    if not found then raise exception 'repair not found'; end if;
    if v_repair.sale_line_item_id is not null then
      raise exception 'this repair''s serial comes from its linked sale — correct it via that sale line instead';
    end if;

    v_before := jsonb_build_object('scope', p_scope, 'row', to_jsonb(v_repair));
    update repair_requests set manual_serial = v_new_serial, updated_at = now() where id = p_id;
    select jsonb_build_object('scope', p_scope, 'row', to_jsonb(r.*)) into v_after
      from repair_requests r where r.id = p_id;

  else
    raise exception 'invalid scope';
  end if;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('serial', p_id, 'edit', v_before, v_after, v_reason, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- repair_void / earmold_void: soft delete, drop out of list queries and
-- the public portal lookup.
-- ---------------------------------------------------------------------
create or replace function repair_void(p_repair_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_repair repair_requests%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_repair from repair_requests where id = p_repair_id for update;
  if not found then raise exception 'repair not found'; end if;
  if v_repair.voided_at is not null then raise exception 'repair already voided'; end if;

  v_before := to_jsonb(v_repair);
  update repair_requests set voided_at = now(), void_reason = v_reason, updated_at = now()
    where id = p_repair_id;
  select to_jsonb(r.*) into v_after from repair_requests r where r.id = p_repair_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('repair', p_repair_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;

create or replace function earmold_void(p_earmold_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_earmold earmold_requests%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
begin
  if auth_role() <> 'admin' then raise exception 'admin only'; end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_earmold from earmold_requests where id = p_earmold_id for update;
  if not found then raise exception 'earmold not found'; end if;
  if v_earmold.voided_at is not null then raise exception 'earmold already voided'; end if;

  v_before := to_jsonb(v_earmold);
  update earmold_requests set voided_at = now(), void_reason = v_reason, updated_at = now()
    where id = p_earmold_id;
  select to_jsonb(e.*) into v_after from earmold_requests e where e.id = p_earmold_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('earmold', p_earmold_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;
