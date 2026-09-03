-- Partner-branch price override: 7 branches are PARTNER-owned (not company)
-- and follow their own SRP, not the company's products.srp / service_pricing.
-- Their branch_rep users must be able to edit sale line unit prices (stock +
-- service). Company branches keep the SRP lock introduced in 0049. Freebie
-- zero-forcing is unconditional for everyone (unchanged).

alter table branches add column if not exists is_partner boolean not null default false;

comment on column branches.is_partner is
  'Partner-owned branch (not company-owned) that sets its own SRP. branch_rep users at partner branches may edit sale line unit prices instead of having them re-derived from products.srp / service_pricing (see recordSale in sales/actions.ts). Company branches stay locked to SRP.';

update branches
set is_partner = true
where name ilike any (array['%gensan%','%butuan%','%iligan%','%bacolod%','%palawan%','%tacloban%','%vigan%']);
