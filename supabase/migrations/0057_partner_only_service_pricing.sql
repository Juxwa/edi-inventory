-- Management decision: only HQ staff (admin) edit service pricing for
-- company-owned (non-partner) branches. Partner branches (branches.is_partner,
-- 0055) keep managing their own prices. Tightens 0052, which let every
-- branch_rep/technical write their own branch's rows regardless of ownership.

drop policy if exists service_pricing_write on service_pricing;

create policy service_pricing_write on service_pricing for all to authenticated
  using (
    auth_role() = 'admin'
    or (
      auth_role() in ('branch_rep', 'technical')
      and branch_id = auth_branch()
      and exists (
        select 1 from branches b
        where b.id = service_pricing.branch_id and b.is_partner
      )
    )
  )
  with check (
    auth_role() = 'admin'
    or (
      auth_role() in ('branch_rep', 'technical')
      and branch_id = auth_branch()
      and exists (
        select 1 from branches b
        where b.id = service_pricing.branch_id and b.is_partner
      )
    )
  );
