# Phase 1 Runbook — run these on your machine

Everything below runs from `D:\Claude\EDI Inventory System\EDI Inventory\app` in a terminal (PowerShell or cmd). Prereq: Node 20+ installed.

## 0. Commit the final review fixes (sandbox died before this commit)

```
git add -A
git commit -m "fix: RLS write checks, paged lookups, esm import"
```

## 1. Install dependencies

```
npm install
```

## 2. Link Supabase and push the schema

```
npx supabase login --token sbp_b99b6b2af913a194c12d91c752db0788211c6073
npx supabase link --project-ref mrqcdkmsswjpqysghnmw -p "hkwpvqqK2L6z8gP8"
npx supabase db push -p "hkwpvqqK2L6z8gP8"
```

Expected: 6 migrations applied (0001_reference … 0006_rls). Verify in the Supabase dashboard → Table Editor: 20 tables, `product_categories` has 11 rows.

## 3. Run unit tests (16 pure-function tests, no DB needed)

```
npx vitest run tests/import-lib.test.ts tests/import-branches.test.ts tests/import-products.test.ts tests/import-service-pricing.test.ts tests/import-stock.test.ts tests/import-transfers.test.ts
```

Expected: 16 passed.

## 4. Run RLS tests (against staging DB)

```
npx vitest run tests/rls.test.ts
```

Expected: 2 passed (branch rep blocked cross-branch; top mgmt sees all). Creates two throwaway test users + a test branch pair — harmless in staging.

## 5. Import the Bubble data

CSV exports are already in `data/exports/`. Run:

```
npm run import
```

Expected output ends with a validation report:

```
branches: 23 rows
suppliers: ~N rows (stubs from product supplier names)
products: 555 rows
services: ~N rows (stubs from pricing service names)
service_pricing: 189 rows
stock: ~20,292 minus exceptions
transfers: ~2,293 minus exceptions
```

## 6. Review exceptions

Check `data/import-reports/*-exceptions.csv`. Expected main case: stock rows located at "Head Office Sales" (1,137 rows) and any other location names that aren't real branches. Options per location name:

- Map it to an existing branch → tell Claude, we add a name-alias map to `scripts/import/stock.ts` and re-run
- It's a real location → add a branch row for it, re-run

Re-running is safe: imports upsert on `legacy_id` (idempotent, no duplicates).

## 7. Done — report back

Paste the validation report + exception counts into the Claude session. Phase 2 (admin UI: products, suppliers, stock intake, inventory views) starts from there.

## Secrets note

`.env.local` holds staging keys and is gitignored. When the client's Supabase account is ready, we either transfer the project into their org or re-run steps 2+5 against a fresh project — everything is code + idempotent imports.
