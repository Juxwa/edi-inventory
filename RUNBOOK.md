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
npx supabase login --token <access token from .env.local>
npx supabase link --project-ref mrqcdkmsswjpqysghnmw -p "<db password from .env.local>"
npx supabase db push -p "<db password from .env.local>"
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

---

# Phase 2 Runbook — Admin UI (Tasks 1-4)

Everything below runs from `D:\Claude\EDI Inventory System\EDI Inventory\app` in PowerShell. Use `;` to chain commands, not `&&`.

## 0. One manual cleanup + one manual copy (sandbox lost filesystem access mid-build)

The sandbox this UI was built in ran out of disk space partway through Task 4 and lost the ability to run shell commands (couldn't `rm`, `cp`, `npm install`, or `next build`). Two manual steps are needed before anything will compile:

**a) Delete a stray duplicate page file:**

```powershell
Remove-Item "src\app\(app)\page.tsx"
Remove-Item "src\app\(app)\page.tsx.DELETE_ME"
```

Without this, `npm run build` / `npm run dev` fails with "You cannot have two parallel pages that resolve to the same path" — both `src\app\page.tsx` and `src\app\(app)\page.tsx` resolve to `/`. The real dashboard lives in `src\app\page.tsx` (it renders `<AppShell>` directly since it sits outside the `(app)` route group); the `(app)` version is a leftover that must go.

**b) Copy the logo into `public/`:**

```powershell
Copy-Item "..\EDI Logo.png" "public\edi-logo.png"
```

(Path is relative to the repo root one level up — adjust if your working copy differs. Source: `D:\Claude\EDI Inventory System\EDI Inventory\EDI Logo.png`.)

## 1. Install dependencies

```powershell
npm install
```

This pulls in Tailwind v4, shadcn/ui's Radix dependencies, `@supabase/ssr`, `react-hook-form`, `zod`, and `sonner` — all added to `package.json` but never installed/verified against a real `npm install` or `next build` due to the sandbox outage above. Watch for version-resolution surprises on first install (React 19 peer deps especially).

## 2. Verify the build

```powershell
npm run build
```

Expected: compiles cleanly once step 0a is done. This has **not** been verified in the sandbox — treat the first local build as the real first build.

## 3. Seed the admin user

In the Supabase dashboard → Authentication → Users → Add user, create an account for `<josh email>` with a password. Then in the SQL editor:

```sql
insert into profiles (id, name, role)
select id, 'Josh', 'admin' from auth.users where email = '<josh email>'
on conflict (id) do update set role = 'admin';
```

## 4. Local checklist

```powershell
npm run dev
```

- Visit `/` while logged out → redirected to `/login`.
- Log in with the seeded admin → redirected to `/`, dashboard renders with 4 stat cards (available stock, branches, active products, aging >180d). Cards should show real counts once Phase 1 data is imported; zeros are expected only if a query errors, not as the normal state.
- Sidebar shows Inventory section (Stock, Stock intake, Products, Suppliers) — full set for `admin`. Header shows role + user menu with working Sign out.
- Sign out → redirected to `/login`.
- Confirm a `branch_rep` profile (if you have a test one) sees only "Stock" under Inventory, no Products/Suppliers/Stock intake.

## Deviations from the plan worth knowing about

- Task 4's file list specifies `src/app/(app)/layout.tsx` — that exists as planned and will wrap Tasks 5-8 pages (`products`, `suppliers`, `inventory`). The dashboard route (`/`) itself is **not** under `(app)/page.tsx` — see step 0a above for why — it's at root `src/app/page.tsx` and calls the same shared `AppShell` component (`src/components/app-shell.tsx`) that `(app)/layout.tsx` uses, so behavior and visuals are identical either way.
- `sonner`'s Toaster is pinned to `theme="light"` (no `next-themes` dependency added) since Phase 2 has no dark-mode toggle.

---

# Phase 2 Runbook — Admin UI (Tasks 5-6: Products, Suppliers)

Built entirely with Read/Write/Edit tools this session — the sandbox's bash tool was unusable (host disk full), so **none of this has been compiled or run**. Treat the first `npm run build` as the real first build and expect to fix at least minor TypeScript issues.

## 1. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- Radix `Select` `name`/`defaultValue` prop typing (used in `product-dialog.tsx`, `product/page.tsx` category filter).
- The Supabase client here has no generated `Database` type (no `database.types.ts` in the repo), so `.from(...).select(...)/.insert(...)/.update(...)` calls are loosely typed — this was relied on to avoid hand-typing every table shape, but it also means Postgrest will silently accept bad column names until runtime. If you later generate types (`npx supabase gen types typescript`), re-check `products/actions.ts` and `suppliers/actions.ts` insert/update payloads compile cleanly against the stricter types.
- `product_categories(name)` / `suppliers(name)` embedded-resource selects in `products/page.tsx` — Supabase returns these as an object for a to-one relation, but the JS client's inferred type without a `Database` generic can be an array; the code defensively handles both shapes via a `firstOrNull` helper. If the build or runtime shows category/supplier name always blank, check the actual embed shape returned and adjust `firstOrNull` usage.

## 2. Local checklist — Products (`/products`)

```powershell
npm run dev
```

- Visit `/products` as the seeded admin. Table loads (or empty state "No products match your search." if the catalog is empty/filtered).
- Click **New product** → dialog opens. Leave name blank, submit → inline "Name is required" error, dialog stays open.
- Fill name only, submit → row appears, dialog closes, toast/redirect not required (revalidatePath refreshes the list).
- Create a second product with the same name → expect **"Product name already exists."** form error (tests the Postgres 23505 mapping).
- Edit a product via the row's `…` menu → change SRP, category, supplier, save → row updates, SRP shows with ₱ and thousands separators (e.g. `₱12,500.00`).
- Toggle **Has serial numbers** and save → "Serialized" badge appears in the Serial column.
- Archive a product from the `…` menu → row disappears from the default (non-archived) view; check **Show archived** and re-apply → row reappears with an "Archived" badge; unarchive from the same menu, confirm it returns to the default view.
- Search box: type part of a product name or code, Apply → list filters. Category select: pick a category, Apply → list filters. Clear link resets all filters.
- Confirm pagination controls appear once there are more than 50 products, and Previous/Next move pages correctly (URL `?page=`).

## 3. Local checklist — Suppliers (`/suppliers`)

- Visit `/suppliers`. Any Phase 1 imported suppliers that were auto-created as stubs (from product supplier names with no other detail) should show an amber **"Needs details"** badge next to the name.
- Click **New supplier** → create with just a name → appears in list, not marked "Needs details" (new suppliers are never stubs).
- Edit a stub supplier, fill in contact info, save → confirm the **"Needs details"** badge disappears (this is the `is_stub = false` write on every update — check it happened even if you didn't touch every field).
- Create a second supplier with a duplicate name → expect **"Supplier name already exists."** error.
- Use the `…` menu to mark a supplier inactive → badge changes to "Inactive"; mark active again → back to "Active".
- Search by name and by contact person substring, confirm both match.

## 4. Known gaps / things to double check locally

- No hard delete anywhere by design (products archive, suppliers go inactive) — confirm this matches expectations before go-live.
- The archive/status toggle and the edit dialog are independent client components reading server-fetched data; after an archive/unarchive or status toggle, the list re-renders via `revalidatePath` but the currently-open row's local `useState` (edit dialog open flag) is unaffected — this is expected, just note it if a stale row briefly shows during rapid clicking.
- Zod schemas (`src/lib/validators/product.ts`, `src/lib/validators/supplier.ts`) use `z.preprocess` instead of `.pipe()` to keep type inference simple under strict mode — no unit tests were written for them this session (plan called for vitest coverage; not done due to the sandbox outage). Recommend adding `tests/validators-product.test.ts` / `tests/validators-supplier.test.ts` covering: empty name rejected, blank optional fields become `null`, valid SRP/category/email accepted, invalid email rejected.

---

# Phase 2 Runbook — Admin UI (Tasks 7-8: Stock intake, Inventory views)

Built entirely with Read/Write/Edit tools this session — the sandbox's bash tool was unusable again (broken, per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build.

## 1. Push the new migration

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0007_intake_rpc.sql` applies cleanly, adding the `stock_intake(...)` function. Verify in the Supabase dashboard → Database → Functions: `stock_intake` exists, language `plpgsql`, returns `setof uuid`. It relies on RLS being enforced as the calling user (no `security definer`), and the Phase 1 `movements_insert` / `stock_write` policies (in `0006_rls.sql`) already permit admin writes — no policy changes needed for this task.

## 2. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- `src/lib/validators/intake.ts` uses a `.transform()` with `ctx.addIssue` + `return z.NEVER` to enforce the serialized-XOR-quantity branch — this is a zod v3 pattern; if the installed zod resolves to a version with different transform/refinement typing, this file is the first place to check.
- `src/app/(app)/inventory/intake/actions.ts` calls `supabase.rpc('stock_intake', { p_product_id, p_branch_id, p_supplier_id, p_serials, p_quantity, p_cost_per_unit, p_invoice_no, p_invoice_date, p_expiry_date, p_repair_pool, p_office_asset })` — param names must match the SQL function signature exactly (they do, verified against the migration). No generated `Database` type exists in this repo, so this call is loosely typed and Postgrest will accept it at compile time even if a name is wrong — a typo here would only surface at runtime as a Postgres "function not found" error.
- `src/components/inventory/intake-form.tsx` mixes an uncontrolled Radix `Select` (branch) with a controlled one (supplier, so picking a serialized/non-serialized product can preselect its supplier) — both rely on Radix's hidden-input `name` bubbling to reach `FormData`. If the branch or supplier value isn't reaching the server action, check this first.
- `src/app/(app)/inventory/page.tsx` resolves product-name search and category filters as two independent product-id lookups against `products`, then applies them as separate `.or()` / `.in()` clauses on `stock` — this avoids an earlier draft bug where combining both filters into one query made "search by name" secretly also require the category match. If filtering behaves oddly with both a search term and a category selected at once, this is the code path to recheck.
- `src/app/(app)/inventory/aging/page.tsx` fetches the entire `stock_aging` view unpaginated (needed to compute branch × bucket summary counts), then paginates the detail table in memory. Fine at Phase 1's data volume (~20K stock rows, a fraction "available") — if this ever becomes slow, move the summary aggregation into a SQL view/RPC instead of doing it in Next.js.

## 3. Local checklist — Stock intake (`/inventory/intake`)

```powershell
npm run dev
```

- Visit `/inventory/intake` as the seeded admin (nav item "Stock intake" only shows for `admin`).
- Type in the product search box → list filters by name/code as you type. Click a non-serialized product → a Quantity field appears; click a serialized product → a "one serial per line" textarea appears instead, and picking a product with a supplier preselects that supplier in the Supplier select.
- **Serialized intake:** pick a serialized product, paste 3 serial numbers (one per line, include a blank line and one duplicate to test cleanup), pick a branch, leave supplier as preselected, enter a cost per unit, invoice no, invoice date. Confirm the live count below the textarea shows the deduped count and a "Duplicate lines were removed" note appears. Submit → toast "N units received" (N = 3, not 4), form resets.
- **Non-serialized intake:** pick a non-serialized product, enter Quantity = 5, fill branch/supplier/cost/invoice date, submit → toast "5 units received".
- Submit with no product selected → button stays disabled (can't submit). Submit with a product but no branch/supplier/invoice date → inline error message from the zod schema (e.g. "Required").

## 4. Local checklist — Stock list (`/inventory`) and aging (`/inventory/aging`)

- Visit `/inventory`. Confirm the 3 serialized + 1 non-serialized (qty 5) rows from step 3 appear, each with an "Available" (green) status badge, correct branch, cost, and today's date as "Received".
- Search box: type part of the serial number or product name, Apply → list filters to matching rows only.
- Category filter: pick the category of the product you just received, Apply → same rows still show; pick an unrelated category → rows disappear. Confirm search + category together narrow correctly (not overly broad or overly narrow — see build note above).
- Status filter: select "Available" → rows show; select any other status → rows disappear (nothing else has been through a status transition yet).
- Branch filter: only visible for `admin`/`top_mgmt` roles — confirm a `branch_rep` test user does not see the Branch dropdown and their list is already scoped to their own branch (RLS, not UI filtering).
- Click "View aging report" → navigates to `/inventory/aging`. Confirm a link/button "Back to stock" returns to `/inventory`.
- On `/inventory/aging`: summary table shows one row per branch with counts in the 0-90 / 91-180 / 181-365 / 365+ columns — the stock you just received should show up under "0-90" for its branch. Detail table below lists the same rows sorted by days-on-hand descending, each with a bucket badge (green/neutral/amber/red).

## 5. Verify movements in the Supabase dashboard

- Table Editor → `stock_movements`. Confirm 4 new rows exist (3 for the serialized intake, 1 for the non-serialized), each `movement_type = 'intake'`, `to_branch_id` matching the branch picked, `quantity` = 1 for each serialized row and 5 for the non-serialized row, `actor_id` = your admin user's id.
- Table Editor → `stock`. Confirm 4 new rows: 3 with distinct `serial_number` values and `quantity = 1`, one with `serial_number` null and `quantity = 5`; all `status = 'available'`, `total_cost` = `cost_per_unit` for the serialized rows and `cost_per_unit * 5` for the quantity row.

## 6. Known gaps / things to double check locally

- No client-side or server-side check that a submitted serial number doesn't already exist elsewhere in `stock` — duplicate real-world serials across intakes are not rejected by the RPC or the form. If that's a requirement, it needs a uniqueness constraint or a pre-check query added later.
- The product picker in the intake form loads the full active product list client-side (no server-side search) — fine at ~555 products (Phase 1 import size), would need a real search endpoint if the catalog grows much larger.
- `/inventory/aging`'s in-memory pagination re-fetches and re-buckets the full aging view on every page click (no caching) — acceptable for now, flagged above as a spot to revisit if it's slow in practice.
