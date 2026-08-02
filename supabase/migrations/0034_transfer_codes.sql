-- Branch-coded transfer references: TR-<FROMCODE>-<TOCODE>-YYMMDD-XXX
-- (e.g. TR-HQ-CEB-260802-4F7). Applies to newly created transfers only;
-- existing rows keep their stored codes since codes are generated once at
-- creation and never rewritten.
--
-- Re-declares the latest version of request_serve (originally defined in
-- 0009_transfer_rpcs.sql and never redeclared since — 0027 touches other
-- transfer functions but not this one) with only the v_code logic changed.
create or replace function request_serve(p_request_id uuid, p_from_branch_id uuid)
returns uuid language plpgsql security invoker as $$
declare
  v_req inventory_requests%rowtype;
  v_id uuid;
  v_code text;
  v_from_code text;
  v_to_code text;
begin
  select * into v_req from inventory_requests where id = p_request_id
    and status = 'pending' for update;
  if not found then raise exception 'request not pending'; end if;
  if p_from_branch_id = v_req.requesting_branch_id then
    raise exception 'source branch must differ from requesting branch';
  end if;

  select code into v_from_code from branches where id = p_from_branch_id;
  select code into v_to_code from branches where id = v_req.requesting_branch_id;
  v_from_code := upper(coalesce(nullif(trim(v_from_code), ''), 'XX'));
  v_to_code := upper(coalesce(nullif(trim(v_to_code), ''), 'XX'));

  -- transfers.code has no unique constraint (idx_transfers_code in
  -- 0001_reference.sql is a plain, non-unique index), so a same-day/
  -- same-route collision on the 3-char suffix would produce two visually
  -- similar codes rather than a failed insert. No retry loop needed; 3 hex
  -- chars matches the format spec.
  v_code := 'TR-' || v_from_code || '-' || v_to_code || '-' ||
    to_char(current_date, 'YYMMDD') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 3));

  insert into transfers (code, from_branch_id, to_branch_id, status, request_id)
  values (v_code, p_from_branch_id, v_req.requesting_branch_id, 'draft', p_request_id)
  returning id into v_id;
  update inventory_requests set status = 'processing', updated_at = now()
    where id = p_request_id;
  return v_id;
end $$;
