-- Branch deactivation: EDI Vista is closed. It must disappear from every
-- actionable branch choice (new sale, transfers, requests, intake, admin
-- user assignment, pricing, repairs/earmolds intake) while remaining fully
-- visible in historical data and in history/report filters (labeled
-- "(closed)" there so past records stay explorable). No RLS change needed —
-- branches select is already open to authenticated users.

alter table branches add column if not exists is_active boolean not null default true;

update branches set is_active = false where name = 'EDI Vista';
