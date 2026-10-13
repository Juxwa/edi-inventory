-- Correction requests: every sale void and every line return is now a
-- REQUEST with a reason, decided by head office, and tracked end to end.
-- Nothing changes on the sale until a request is approved.
--
-- Who decides (management rule, 2026-10-09):
--   request filed by a branch user   -> HQ staff or the HQ supervisor
--   request filed by hq_staff/admin  -> the HQ supervisor only
--   nobody decides their own request; admin does not approve.
--
-- Direct sale_void / sale_return_line calls are disabled. Their logic moves,
-- unchanged, into *_apply functions that only correction_request_decide can
-- reach.

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
-- The role exactly as stored on the profile.
create function auth_real_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles
   where id = auth.uid() and is_active and not must_change_password $$;

-- hq_staff is deliberately reported as branch_rep here: every existing
-- policy and RPC then treats HQ staff as a branch rep of their own (HQ)
-- branch with no per-policy changes. Anything that must tell the two apart
-- uses auth_real_role() / auth_approver_tier(). supervisor is returned as-is
-- and matches no existing role allowlist, i.e. approvals only.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select case when role = 'hq_staff' then 'branch_rep'::user_role else role end
   from profiles
   where id = auth.uid() and is_active and not must_change_password $$;

-- 'supervisor' | 'hq_staff' | null. HQ staff only count as approvers while
-- assigned to the head-office branch.
create function auth_approver_tier() returns text
language sql stable security definer set search_path = public as
$$ select case
     when p.role = 'supervisor' then 'supervisor'
     when p.role = 'hq_staff' and coalesce(b.is_head_office, false) then 'hq_staff'
     else null
   end
   from profiles p left join branches b on b.id = p.branch_id
   where p.id = auth.uid() and p.is_active and not p.must_change_password $$;

-- ---------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------
create table correction_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sale_void', 'sale_return_line')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  sale_id uuid not null references sales(id) on delete cascade,
  sale_line_id uuid references sale_line_items(id) on delete cascade,
  quantity numeric check (quantity is null or quantity > 0),
  -- Branch of the sale: scopes who can see the request.
  branch_id uuid not null references branches(id),
  reason text not null check (length(trim(reason)) > 0),
  -- The record as it looked when the request was filed, for the approver.
  -- Holds no customer name (customer privacy for isolated branches, 0042);
  -- the app resolves the name under the viewer's own RLS.
  snapshot jsonb not null,
  requested_by uuid not null references profiles(id),
  requested_role user_role not null,
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  check ((kind = 'sale_return_line') = (sale_line_id is not null and quantity is not null))
);
create index idx_correction_requests_status on correction_requests (status, requested_at desc);
create index idx_correction_requests_sale on correction_requests (sale_id);
-- One open request per sale void / per line return.
create unique index uq_correction_pending_void on correction_requests (sale_id)
  where status = 'pending' and kind = 'sale_void';
create unique index uq_correction_pending_return on correction_requests (sale_line_id)
  where status = 'pending' and kind = 'sale_return_line';

alter table correction_requests enable row level security;

-- Read: the requester, the sale's branch, approvers, admin and top management.
-- All writes go through the RPCs below.
create policy correction_requests_read on correction_requests for select to authenticated
  using (
    requested_by = auth.uid()
    or branch_id = auth_branch()
    or auth_real_role() in ('admin', 'top_mgmt')
    or auth_approver_tier() is not null
  );

revoke insert, update, delete on table correction_requests from anon, authenticated;

-- ---------------------------------------------------------------------
-- Apply functions (internal): the previous sale_return_line / sale_void
-- bodies (0059) without their role checks. Not executable through the API.
-- ---------------------------------------------------------------------
create function sale_return_line_apply(
  p_line_id uuid, p_quantity numeric, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_line sale_line_items%rowtype; v_sale sales%rowtype; v_stock stock%rowtype;
        v_already numeric; v_new_status after_sales_status;
begin
  select * into v_line from sale_line_items where id = p_line_id for update;
  if not found then raise exception 'line not found'; end if;
  if v_line.line_type <> 'stock' then raise exception 'only stock lines can be returned'; end if;
  select * into v_sale from sales where id = v_line.sale_id;
  if v_sale.voided_at is not null then raise exception 'sale already voided'; end if;
  v_already := coalesce(v_line.returned_quantity, 0);
  if p_quantity <= 0 or v_already + p_quantity > v_line.quantity then
    raise exception 'invalid return quantity';
  end if;
  if v_line.serial_snapshot is not null and p_quantity <> v_line.quantity then
    raise exception 'serialized items must be returned in full';
  end if;

  if v_line.stock_id is not null then
    select * into v_stock from stock where id = v_line.stock_id for update;
    if v_stock.serial_number is not null then
      perform 1 from stock
        where lower(trim(serial_number)) = lower(trim(v_stock.serial_number))
          and id <> v_stock.id and quantity > 0 and status <> 'sold';
      if found then
        raise exception 'another active stock row already exists for serial % — resolve it before returning', v_stock.serial_number;
      end if;
      update stock set status = 'available', quantity = 1,
        total_cost = cost_per_unit, return_date = current_date,
        updated_at = now() where id = v_stock.id;
    else
      update stock set quantity = quantity + p_quantity,
        status = 'available',
        total_cost = cost_per_unit * (quantity + p_quantity),
        return_date = current_date, updated_at = now() where id = v_stock.id;
    end if;
    insert into stock_movements (stock_id, movement_type, quantity, to_branch_id,
      reference_type, reference_id, actor_id, note)
    values (v_stock.id, 'return', p_quantity, v_sale.branch_id, 'sale', v_sale.id,
      auth.uid(), 'return: ' || coalesce(p_note, ''));
  end if;

  if v_already + p_quantity = v_line.quantity then v_new_status := 'returned';
  else v_new_status := 'partially_returned'; end if;

  update sale_line_items set returned_quantity = v_already + p_quantity,
    return_date = current_date, after_sales_status = v_new_status, updated_at = now()
    where id = p_line_id;
end $$;

create function sale_void_apply(p_sale_id uuid, p_reason text)
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
          perform 1 from stock
            where lower(trim(serial_number)) = lower(trim(v_stock.serial_number))
              and id <> v_stock.id and quantity > 0 and status <> 'sold';
          if found then
            raise exception 'another active stock row already exists for serial % — resolve it before voiding', v_stock.serial_number;
          end if;
          update stock set status = 'available', quantity = 1,
            total_cost = cost_per_unit, return_date = current_date,
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
  ) into v_after
  from sales s where s.id = p_sale_id;

  insert into admin_corrections (entity, entity_id, action, before_data, after_data, reason, actor_id)
  values ('sale', p_sale_id, 'void', v_before, v_after, v_reason, auth.uid());
end $$;

revoke all on function sale_return_line_apply(uuid, numeric, text) from public, anon, authenticated;
revoke all on function sale_void_apply(uuid, text) from public, anon, authenticated;

-- Direct entry points are closed. Signatures kept so stale clients get a
-- clear message instead of "function not found".
create or replace function sale_return_line(
  p_line_id uuid, p_quantity numeric, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Direct returns are disabled — file a return request for HQ approval.';
end $$;

create or replace function sale_void(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Direct voids are disabled — file a void request for HQ approval.';
end $$;

-- ---------------------------------------------------------------------
-- Request -> decide
-- ---------------------------------------------------------------------
create function correction_request_create(
  p_kind text, p_sale_id uuid, p_sale_line_id uuid, p_quantity numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := auth_real_role();
  v_reason text := trim(coalesce(p_reason, ''));
  v_sale sales%rowtype;
  v_line sale_line_items%rowtype;
  v_already numeric;
  v_snapshot jsonb;
  v_id uuid;
begin
  if v_uid is null or v_role is null then raise exception 'not authenticated'; end if;
  if v_role in ('supervisor', 'top_mgmt') then
    raise exception 'your role cannot file correction requests';
  end if;
  if p_kind is null or p_kind not in ('sale_void', 'sale_return_line') then
    raise exception 'unknown request type';
  end if;
  if length(v_reason) = 0 then raise exception 'reason required'; end if;

  select * into v_sale from sales where id = p_sale_id;
  if not found then raise exception 'sale not found'; end if;
  if not (v_role = 'admin' or auth_branch() = v_sale.branch_id) then
    raise exception 'not authorized for this sale';
  end if;
  if v_sale.voided_at is not null then raise exception 'sale already voided'; end if;

  if p_kind = 'sale_return_line' then
    select * into v_line from sale_line_items where id = p_sale_line_id and sale_id = p_sale_id;
    if not found then raise exception 'line not found'; end if;
    if v_line.line_type <> 'stock' then raise exception 'only stock lines can be returned'; end if;
    v_already := coalesce(v_line.returned_quantity, 0);
    if p_quantity is null or p_quantity <= 0 or v_already + p_quantity > v_line.quantity then
      raise exception 'invalid return quantity';
    end if;
    if v_line.serial_snapshot is not null and p_quantity <> v_line.quantity then
      raise exception 'serialized items must be returned in full';
    end if;
    perform 1 from correction_requests
      where sale_line_id = p_sale_line_id and status = 'pending' and kind = 'sale_return_line';
    if found then raise exception 'a return request is already pending for this line'; end if;
  else
    p_sale_line_id := null;
    p_quantity := null;
    perform 1 from correction_requests
      where sale_id = p_sale_id and status = 'pending' and kind = 'sale_void';
    if found then raise exception 'a void request is already pending for this sale'; end if;
  end if;

  select jsonb_build_object(
    'sale_date', v_sale.sale_date,
    'or_no', v_sale.or_no, 'csi_no', v_sale.csi_no, 'ci_no', v_sale.ci_no,
    'customer_id', v_sale.customer_id,
    'branch', (select b.name from branches b where b.id = v_sale.branch_id),
    'discount', v_sale.discount,
    'gross', coalesce((select sum(l.quantity * l.unit_price) from sale_line_items l
                        where l.sale_id = p_sale_id), 0),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'item', coalesce(p.name, sv.name, 'Item'),
        'line_type', l.line_type,
        'serial', l.serial_snapshot,
        'quantity', l.quantity,
        'returned_quantity', coalesce(l.returned_quantity, 0),
        'unit_price', l.unit_price
      ) order by l.created_at, l.id)
      from sale_line_items l
      left join stock st on st.id = l.stock_id
      left join products p on p.id = coalesce(l.product_id, st.product_id)
      left join services sv on sv.id = l.service_id
      where l.sale_id = p_sale_id), '[]'::jsonb)
  ) into v_snapshot;

  insert into correction_requests (
    kind, sale_id, sale_line_id, quantity, branch_id, reason, snapshot,
    requested_by, requested_role
  ) values (
    p_kind, p_sale_id, p_sale_line_id, p_quantity, v_sale.branch_id, v_reason, v_snapshot,
    v_uid, v_role
  ) returning id into v_id;
  return v_id;
end $$;

-- Approve applies the correction in the same transaction: if the sale has
-- changed so that it can no longer be applied, the whole call fails and the
-- request stays pending (reject it instead).
create function correction_request_decide(
  p_request_id uuid, p_approve boolean, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tier text := auth_approver_tier();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_req correction_requests%rowtype;
begin
  if v_tier is null then raise exception 'not authorized to decide requests'; end if;
  if p_approve is null then raise exception 'decision required'; end if;

  select * into v_req from correction_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'request already %', v_req.status; end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'you cannot decide your own request';
  end if;
  if v_tier <> 'supervisor' and v_req.requested_role in ('hq_staff', 'admin', 'supervisor') then
    raise exception 'only the HQ supervisor can decide this request';
  end if;
  if not p_approve and v_note is null then
    raise exception 'a note is required to reject a request';
  end if;

  if p_approve then
    if v_req.kind = 'sale_void' then
      perform sale_void_apply(v_req.sale_id, v_req.reason);
    else
      perform sale_return_line_apply(v_req.sale_line_id, v_req.quantity, v_req.reason);
    end if;
  end if;

  update correction_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = v_note
  where id = p_request_id;
end $$;

-- The requester can withdraw a request that has not been decided yet.
create function correction_request_cancel(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req correction_requests%rowtype;
begin
  select * into v_req from correction_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if v_req.requested_by <> auth.uid() then raise exception 'not your request'; end if;
  if v_req.status <> 'pending' then raise exception 'request already %', v_req.status; end if;
  update correction_requests set status = 'cancelled', decided_at = now()
  where id = p_request_id;
end $$;

revoke all on function auth_real_role() from public, anon;
revoke all on function auth_approver_tier() from public, anon;
revoke all on function correction_request_create(text, uuid, uuid, numeric, text) from public, anon;
revoke all on function correction_request_decide(uuid, boolean, text) from public, anon;
revoke all on function correction_request_cancel(uuid) from public, anon;
grant execute on function auth_real_role() to authenticated;
grant execute on function auth_approver_tier() to authenticated;
grant execute on function correction_request_create(text, uuid, uuid, numeric, text) to authenticated;
grant execute on function correction_request_decide(uuid, boolean, text) to authenticated;
grant execute on function correction_request_cancel(uuid) to authenticated;
