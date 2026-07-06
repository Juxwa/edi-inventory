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
