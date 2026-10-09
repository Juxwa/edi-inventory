-- Two new roles for the correction-approval flow (0062).
--
--   hq_staff    Head-office staff. Works like a branch rep of the HQ branch
--               everywhere else in the app, and can additionally approve
--               correction requests filed by branches.
--   supervisor  HQ supervisor. Approvals only: decides every correction
--               request, and is the only role that can decide requests filed
--               by hq_staff or admin.
--
-- Kept in its own migration on purpose: Postgres does not allow a new enum
-- value to be used in the same transaction that adds it, and 0062 uses both.

alter type user_role add value if not exists 'hq_staff';
alter type user_role add value if not exists 'supervisor';
