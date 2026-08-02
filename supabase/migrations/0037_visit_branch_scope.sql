-- Branch isolation for visit history. Decision (owner, 2026-08-02): patients
-- remain a shared directory (customers_read stays `using(true)` so any branch
-- can look up any patient for referrals/walk-ins), but a branch rep should see
-- only their OWN branch's visit history. All other transactional tables
-- (sales, stock, transfers, requests, repairs) are already branch-scoped.
--
-- Legacy visits imported from Bubble carry NO branch tag (visits.branch_id is
-- null on all 4,836 imported rows — the old system never recorded which branch
-- a visit occurred at). So a visit is attributed to a branch by either:
--   * visits.branch_id (stamped by logVisit on all NEW visits going forward), or
--   * the branch of the sale it resulted in (resulted_in_sale_id -> sales.branch_id).
-- A legacy visit with neither signal is visible only to admin + top_mgmt
-- (HQ and the reviewing doctors), who retain full cross-branch visibility —
-- the clinically relevant legacy visits (those with test files) are flagged
-- is_hearing_test and surfaced to top_mgmt on /hearing-tests regardless.

drop policy visits_read on visits;
create policy visits_read on visits for select to authenticated
  using (
    auth_role() in ('admin', 'top_mgmt')
    or branch_id = auth_branch()
    or exists (
      select 1 from sales s
      where s.id = visits.resulted_in_sale_id
        and s.branch_id = auth_branch()
    )
  );
