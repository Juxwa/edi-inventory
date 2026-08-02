-- =============================================================================
-- WIPE-DB — full data wipe for a clean Bubble reimport
-- =============================================================================
-- WHAT THIS DOES
--   Section 1 truncates every legacy-imported / app-generated data table so
--   `npm run import` can reload fresh Bubble exports without upsert-merging
--   against stale rows (import upserts on legacy_id, so leftover rows survive
--   a normal reimport unless this is run first).
--
-- THIS IS IRREVERSIBLE.
--   TRUNCATE does not go through triggers/soft-delete and cannot be undone by
--   the app. `restart identity` also resets any serial sequences to 1.
--
-- PREREQUISITES — do these BEFORE running anything below:
--   1. Take a Supabase backup/snapshot (Dashboard → Database → Backups, or
--      `supabase db dump` if you want a local copy) and confirm it succeeded.
--   2. Run `supabase db push` first so migrations 0029-0031 are applied —
--      running this against an out-of-date schema can fail or skip columns.
--   3. Decide Option A vs Option B (see Section 2 below) BEFORE you run
--      Section 1, since the two options truncate a different table list.
--   4. Run this in the Supabase SQL editor against the correct project.
--      There is no confirmation prompt once you hit Run.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — always run this (choose the table list matching your Option)
-- =============================================================================
-- FK-safe order: children before parents, no CASCADE needed. Does NOT touch
-- product_categories (seeded by migration 0001, referenced by products —
-- must survive every wipe).
--
-- This is the OPTION A / default flow (wipes users AND includes `branches` +
-- `profiles` in the truncate). If you are doing OPTION B (keep existing
-- branches + logins working), use the alternate list in the comment block
-- at the bottom instead.
--
-- ORDER MATTERS: `profiles.branch_id` references `branches`, so Postgres
-- refuses to truncate `branches` unless `profiles` is in the same TRUNCATE
-- statement — which is only acceptable under Option A (users wiped anyway).
-- The TRUNCATE runs FIRST: rows in stock_movements / sales / etc. hold FK
-- references to `profiles` (e.g. stock_movements.actor_id has no cascade),
-- so auth.users cannot be deleted while that data exists — its cascade into
-- profiles would be blocked. Truncating all data tables (profiles included)
-- clears every referencing row, then the auth.users delete succeeds with
-- nothing left to cascade into. Never TRUNCATE auth.users directly
-- (Supabase-managed; use DELETE).

begin;

truncate table
  chat_messages, admin_corrections, stock_movements, rate_limits,
  repair_status_events, repair_requests, earmold_requests,
  visits, sale_line_items, sales,
  transfer_line_items, transfers,
  request_line_items, inventory_requests,
  stock, service_pricing, customers,
  products, services, suppliers, profiles, branches
restart identity;

delete from auth.users;

commit;

-- After this: every login is gone. Recreate accounts with
-- `npm run bulk-users` (default password edi2026, forced change on first
-- login) before anyone tries to sign in.


-- =============================================================================
-- OPTION B (alternative to Section 2) — keep existing branches + logins
-- =============================================================================
-- Skip Section 2 entirely. Instead, run Section 1 with `branches` REMOVED
-- from the truncate list, so branch UUIDs (and therefore profiles.branch_id)
-- stay valid and nobody needs a new account. Everything else still gets
-- wiped and reimported fresh.
--
-- Replace the Section 1 statement with:
--
--   begin;
--
--   truncate table
--     chat_messages, admin_corrections, stock_movements, rate_limits,
--     repair_status_events, repair_requests, earmold_requests,
--     visits, sale_line_items, sales,
--     transfer_line_items, transfers,
--     request_line_items, inventory_requests,
--     stock, service_pricing, customers,
--     products, services, suppliers
--   restart identity;
--
--   commit;
--
-- Note: the Bubble product_categories/branches import path does not create
-- new branches on reimport if legacy_id rows already exist (import upserts
-- on legacy_id) — with Option B, branch legacy_ids from the fresh export
-- must match the ones already in the table or you'll get duplicate branches
-- instead of updates.
