-- Sale submission log + one-time form token.
--
-- Why: a branch reported the New Sale form "submitting by itself" and moving
-- to the next page mid-entry. The form used to submit on Enter from any text
-- field (barcode scanners send Enter after every scan), and nothing stopped
-- the same form from being recorded twice. The form now blocks Enter, asks
-- for confirmation, and carries a one-time token; this table is where that
-- token lives and where each attempt is logged, so we can tell a deliberate
-- double submit from a hardware/keyboard artefact.
--
-- One row per form instance (token is generated when the form opens):
--   status              pending  -> the sale is being recorded right now
--                       recorded -> sale_id is the sale this form produced
--                       failed   -> the attempt errored; the same form may retry
--   duplicate_attempts  how many extra submits arrived for a token that was
--                       already pending/recorded (a true double submit)
--   enter_blocked_count Enter presses the form swallowed before submit
--                       (scanner / stuck key signal)
--   review_trigger,
--   confirm_trigger     pointer | keyboard — how the Review and Confirm
--                       buttons were activated
--   form_open_seconds   seconds between the form opening and the confirm
--
-- Telemetry columns are client-reported: diagnostics only, never trusted for
-- anything else.

create table sale_submissions (
  token uuid primary key,
  actor_id uuid not null references profiles(id),
  branch_id uuid references branches(id),
  status text not null default 'pending'
    check (status in ('pending', 'recorded', 'failed')),
  sale_id uuid references sales(id) on delete set null,
  line_count integer,
  form_open_seconds integer,
  enter_blocked_count integer not null default 0,
  review_trigger text check (review_trigger in ('pointer', 'keyboard')),
  confirm_trigger text check (confirm_trigger in ('pointer', 'keyboard')),
  duplicate_attempts integer not null default 0,
  last_error text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sale_submissions_actor on sale_submissions (actor_id, created_at desc);
create index idx_sale_submissions_sale on sale_submissions (sale_id);

alter table sale_submissions enable row level security;

-- Read-only through the API; all writes go through the two RPCs below.
create policy sale_submissions_read on sale_submissions for select to authenticated
  using (auth_role() in ('admin', 'top_mgmt') or actor_id = auth.uid());

revoke insert, update, delete on table sale_submissions from anon, authenticated;

-- Claims a form token before the sale is recorded. Returns
--   { outcome: 'claimed' }                          -> go ahead and record
--   { outcome: 'duplicate_recorded', sale_id }      -> already recorded, show it
--   { outcome: 'in_progress' }                      -> first submit still running
create function sale_submission_claim(
  p_token uuid,
  p_branch_id uuid,
  p_line_count integer,
  p_form_open_seconds integer,
  p_enter_blocked_count integer,
  p_review_trigger text,
  p_confirm_trigger text,
  p_user_agent text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row sale_submissions%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_token is null then raise exception 'submission token required'; end if;

  insert into sale_submissions (
    token, actor_id, branch_id, line_count, form_open_seconds,
    enter_blocked_count, review_trigger, confirm_trigger, user_agent
  ) values (
    p_token, v_uid, p_branch_id, p_line_count, p_form_open_seconds,
    coalesce(p_enter_blocked_count, 0), p_review_trigger, p_confirm_trigger,
    left(p_user_agent, 400)
  )
  on conflict (token) do nothing;

  if found then
    return jsonb_build_object('outcome', 'claimed');
  end if;

  select * into v_row from sale_submissions where token = p_token for update;
  if v_row.actor_id <> v_uid then
    raise exception 'submission token belongs to another user';
  end if;

  -- A failed attempt releases the token: the operator fixes the form and
  -- submits the same form again.
  if v_row.status = 'failed' then
    update sale_submissions set
      status = 'pending',
      branch_id = p_branch_id,
      line_count = p_line_count,
      form_open_seconds = p_form_open_seconds,
      enter_blocked_count = coalesce(p_enter_blocked_count, 0),
      review_trigger = p_review_trigger,
      confirm_trigger = p_confirm_trigger,
      updated_at = now()
    where token = p_token;
    return jsonb_build_object('outcome', 'claimed');
  end if;

  update sale_submissions set
    duplicate_attempts = duplicate_attempts + 1,
    updated_at = now()
  where token = p_token;

  if v_row.status = 'recorded' and v_row.sale_id is not null then
    return jsonb_build_object('outcome', 'duplicate_recorded', 'sale_id', v_row.sale_id);
  end if;
  return jsonb_build_object('outcome', 'in_progress');
end $$;

-- Closes a claimed token: recorded when p_sale_id is given, failed otherwise.
create function sale_submission_finish(
  p_token uuid,
  p_sale_id uuid,
  p_error text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update sale_submissions set
    status = case when p_sale_id is not null then 'recorded' else 'failed' end,
    sale_id = coalesce(p_sale_id, sale_id),
    last_error = case when p_sale_id is not null then null else left(p_error, 500) end,
    updated_at = now()
  where token = p_token
    and actor_id = auth.uid()
    and status = 'pending';
end $$;

revoke all on function sale_submission_claim(uuid, uuid, integer, integer, integer, text, text, text) from public, anon;
revoke all on function sale_submission_finish(uuid, uuid, text) from public, anon;
grant execute on function sale_submission_claim(uuid, uuid, integer, integer, integer, text, text, text) to authenticated;
grant execute on function sale_submission_finish(uuid, uuid, text) to authenticated;
