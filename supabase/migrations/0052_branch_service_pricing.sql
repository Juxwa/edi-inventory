-- Branch-managed service pricing (client decision: each branch sets its
-- own prices, rather than admin-only pricing). service_pricing keeps its
-- existing cat_read policy (0006 — all authenticated can read every
-- branch's prices; needed so sale-line price lookups and cross-branch
-- admin views keep working). Write access changes: 0006's cat_admin_write
-- (admin-only, shared policy name across several catalog tables — this
-- drop only targets the service_pricing table) is replaced with a policy
-- that also lets branch_rep and technical write ONLY their own branch's
-- rows (branch_id = auth_branch()), covering insert/update/delete via
-- `for all`.

drop policy if exists cat_admin_write on service_pricing;

create policy service_pricing_write on service_pricing for all to authenticated
  using (
    auth_role() = 'admin'
    or (auth_role() in ('branch_rep', 'technical') and branch_id = auth_branch())
  )
  with check (
    auth_role() = 'admin'
    or (auth_role() in ('branch_rep', 'technical') and branch_id = auth_branch())
  );
