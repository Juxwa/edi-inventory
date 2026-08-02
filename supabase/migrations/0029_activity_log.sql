-- Site-wide action log. Trigger-captured, backend-admin only.
-- NOT a replacement for admin_corrections (0022) — that stays the
-- reason-carrying record of deliberate admin voids; this is the raw
-- who/what/when.

create table activity_log (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  table_name   text not null,
  op           text not null check (op in ('INSERT','UPDATE','DELETE')),
  row_id       text,
  actor_id     uuid,
  old_data     jsonb,
  new_data     jsonb,
  changed_cols text[],
  context      jsonb
);

create index idx_activity_occurred  on activity_log (occurred_at desc);
create index idx_activity_table_row on activity_log (table_name, row_id);
create index idx_activity_actor     on activity_log (actor_id, occurred_at desc);

-- Deny-all: RLS on with ZERO policies blocks anon + authenticated outright.
-- Do NOT add FORCE ROW LEVEL SECURITY — the trigger function's owner
-- (postgres) must keep its owner-bypass to insert.
alter table activity_log enable row level security;
revoke all on table activity_log from anon, authenticated;
revoke all on sequence activity_log_id_seq from anon, authenticated;

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb; v_new jsonb; v_cols text[]; v_headers json;
begin
  -- Service-role / psql / migration writes carry no JWT subject. Skipping them
  -- keeps the 20k-row Bubble import and any wipe+reimport out of the log.
  -- Set edi.audit_service_role='on' for a session to capture them anyway.
  if v_actor is null
     and coalesce(current_setting('edi.audit_service_role', true), 'off') <> 'on'
  then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if v_old = v_new then return null; end if;
    select array_agg(key order by key) into v_cols
      from jsonb_each(v_new) where v_old -> key is distinct from value;
    if v_cols = array['updated_at'] then return null; end if;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  insert into activity_log
    (table_name, op, row_id, actor_id, old_data, new_data, changed_cols, context)
  values (
    tg_table_name, tg_op, coalesce(v_new, v_old) ->> 'id',
    v_actor, v_old, v_new, v_cols,
    case when v_headers is null then null else jsonb_build_object(
      'ip', v_headers ->> 'x-forwarded-for',
      'ua', left(coalesce(v_headers ->> 'user-agent', ''), 200)
    ) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'stock','sales','sale_line_items','transfers','transfer_line_items',
    'inventory_requests','request_line_items','repair_requests',
    'repair_status_events','earmold_requests','customers','visits',
    'profiles','products','suppliers','services','service_pricing','branches'
  ] loop
    execute format(
      'drop trigger if exists trg_activity_log on %I;
       create trigger trg_activity_log after insert or update or delete on %I
       for each row execute function log_activity()', t, t);
  end loop;
end $$;

-- admin_corrections is itself an audit table; log only tampering with it.
drop trigger if exists trg_activity_log on admin_corrections;
create trigger trg_activity_log after update or delete on admin_corrections
for each row execute function log_activity();
