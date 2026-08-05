-- Audit log for customer de-duplication merges. Each row preserves the full
-- deleted customer record and the exact FK rows repointed to the keeper, so
-- any merge can be reversed (re-insert merged_row, repoint the listed ids
-- back). Written by scripts/admin/merge-duplicate-customers.ts.
create table customer_merge_log (
  id bigserial primary key,
  batch text not null,
  kept_id uuid not null,
  merged_id uuid not null,
  merged_legacy_id text,
  merged_row jsonb not null,
  repointed jsonb not null, -- { sales: uuid[], visits: uuid[], repairs: uuid[] }
  merged_at timestamptz not null default now()
);
create index idx_cml_batch on customer_merge_log(batch);
create index idx_cml_kept on customer_merge_log(kept_id);

alter table customer_merge_log enable row level security;
create policy cml_read on customer_merge_log for select to authenticated
  using (auth_role() = 'admin');
-- no insert/update/delete policies: only the service role writes
