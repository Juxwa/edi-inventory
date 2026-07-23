-- Phase 6c item C: patient hearing-test review workflow for top management.
-- Branches log a visit as a hearing test (with the existing visit-files
-- attachment mechanism doubling as the test-file upload); top_mgmt/admin
-- review across all branches, add notes, mark reviewed, and optionally
-- link the visit to the sale it resulted in.

alter table visits add column if not exists is_hearing_test boolean not null default false;
alter table visits add column if not exists reviewed_at timestamptz;
alter table visits add column if not exists reviewed_by uuid references profiles(id);
alter table visits add column if not exists review_notes text;
alter table visits add column if not exists resulted_in_sale_id uuid references sales(id);

-- RLS note: 0012's visits_write already grants UPDATE on every visits
-- column, to any row, for admin/branch_rep/top_mgmt (visits carry no
-- branch_id to scope against — this is pre-existing behavior, not
-- introduced here). That means branch_rep already technically has the
-- Postgres-level ability to write the new review_* columns; this
-- migration does not attempt to claw that back (would require a
-- column-aware trigger, out of scope for this change) and does not
-- weaken it. What this migration adds is an explicit, minimal UPDATE
-- grant scoped to just top_mgmt/admin, so the review workflow has its
-- own dedicated policy independent of visits_write. Practical
-- enforcement that a branch_rep cannot use the review workflow is the
-- server action role guard in src/app/(app)/hearing-tests/actions.ts
-- (reviewHearingTest / linkVisitSale check getProfile().role before
-- writing) — belt-and-braces with this policy, matching the pattern
-- already used for admin_corrections RPCs.
create policy visits_review_write on visits for update to authenticated
  using (auth_role() in ('admin','top_mgmt'))
  with check (auth_role() in ('admin','top_mgmt'));
