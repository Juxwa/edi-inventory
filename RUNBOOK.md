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

---

# Phase 3 Runbook — Transfers (Tasks 1-5: migrations, list/detail, lifecycle)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. Stock requests (Task 6, `/requests`) are **not** part of this drop — the nav intentionally does not link to it yet.

## 1. Push the two new migrations, in order

```powershell
npx supabase db push -p "<db password from .env.local>"
```

`supabase db push` applies pending migrations in filename order, so `0008_stock_reserved.sql` always runs before `0009_transfer_rpcs.sql` in a single invocation — this matters because `0008` adds the `reserved` enum value to `stock_status` and Postgres will not let a new enum value be referenced by name in the same transaction it was created in. `0009`'s functions reference `'reserved'`, so if you ever apply these by hand (e.g. pasting into the SQL editor) run `0008` first, wait for it to commit, then run `0009` separately — do not paste both in one statement batch.

Expected after push: Database → Functions shows `transfer_reserve`, `transfer_dispatch`, `transfer_receive_line`, `request_serve` (language `plpgsql`, security invoker). Table Editor → `transfers` has a new `request_id` column; `transfer_line_items` has a new `received_note` column. Enum check: Database → Enumerated Types → `stock_status` includes `reserved`.

## 2. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- `src/app/(app)/transfers/page.tsx` and `src/app/(app)/transfers/[id]/page.tsx` deliberately avoid Postgrest embed disambiguation syntax (`branches!transfers_from_branch_id_fkey(name)`) for the two branch FKs on `transfers` — untested against this project's actual constraint names, and no other file in the codebase uses that syntax. Instead both pages fetch `branches` separately and resolve names via a `Map`. If you'd prefer the embed form, verify the real FK constraint names first (`\d transfers` in `psql` or Table Editor → `transfers` → foreign keys) — they should default to `transfers_from_branch_id_fkey` / `transfers_to_branch_id_fkey` from the plain `references branches(id)` columns, but this was not verified against a live database this session.
- Same reasoning on `src/app/(app)/transfers/[id]/page.tsx` for line → product names: rather than a two-level embed (`transfer_line_items` → `stock` → `products`), it fetches line rows, collects `stock_id`s, then does one more `stock` query with a `products(name)` embed and joins in memory. If this looks like unnecessary round trips, it's intentional — a nested two-level Postgrest embed's response shape without generated `Database` types was judged too risky to guess at compile time.
- `src/app/(app)/transfers/actions.ts` calls four RPCs: `transfer_reserve` (`p_transfer_id`), `transfer_dispatch` (`p_transfer_id, p_courier, p_tracking_code, p_sis_no`), `transfer_receive_line` (`p_line_id, p_confirm, p_note`), and (not yet wired to UI — reserved for the Task 6 requests screen) `request_serve` (`p_request_id, p_from_branch_id`). Param names were checked by hand against `0009_transfer_rpcs.sql` and match exactly; a typo here would only surface at runtime as a Postgres "function not found" error since there's no generated `Database` type to catch it at compile time.
- `src/lib/validators/transfer.ts`'s `receiveLineSchema` uses a custom `booleanFromFormString` preprocessor instead of `z.coerce.boolean()` — `z.coerce.boolean()` on the literal string `"false"` coerces to `true` (any non-empty string is truthy in JS), which would have silently broken the "Report issue" (discrepancy) path. Worth a unit test if you add a validators test suite later.
- RLS interaction to double check once data exists: `tli_all`'s write check (`0006_rls.sql`) only allows `from_branch_id = auth_branch()` (or admin) to write `transfer_line_items` — a `branch_rep` at the *to*-branch cannot add/remove draft lines even though the detail page's `canManageDraft` flag is UI-only gating (admin or from-branch user). This is intentional defense in depth, but if a to-branch admin-equivalent role ever needs to edit drafts, RLS needs a matching change, not just the UI flag.

## 3. Manual checklist — Transfers list and lifecycle (`/transfers`)

```powershell
npm run dev
```

Seed data needed: at least 2 branches, and in the "from" branch at least one serialized stock row (`status = 'available'`) and one non-serialized lot row with `quantity` >= 2 (`status = 'available'`).

- Visit `/transfers` as admin. Nav shows a "Transfers" section (admin/branch_rep/top_mgmt only — a `technical`-role user should be redirected to `/` if they hit `/transfers` or `/transfers/[id]` directly).
- Click **New transfer** → `/transfers/new`. As admin, both From and To branch selects are open; as a `branch_rep` test user, From branch is locked to their own branch (read-only field, not a select).
- Create a draft with From ≠ To branch → redirected to `/transfers/[id]`, status badge shows **Draft** (secondary/neutral). Submitting with From = To should show "From and to branches must be different."
- On the detail page (still draft): use the stock search box (`?stockq=`) to find your serialized item by serial number or product name — confirm results are scoped to the From branch and `status = 'available'` only (an item at a different branch, or already `reserved`/`transferred`, should not appear). Click **Add** on the serialized row (qty field is fixed/hidden at 1) → line appears in the table above with the serial shown.
- Search for the lot product, enter a quantity less than its available quantity in the row's qty box, click **Add** → line appears with that partial quantity; the lot's own available-stock row should still show (not yet decremented — quantity only splits at Reserve).
- Try adding a quantity greater than available → server action should reject with "Quantity exceeds available stock." (toast).
- Remove a line via its **Remove** button → line disappears, no server error.
- Leave the transfer as a 7+ day old draft (or backdate `created_at` in the SQL editor for a test row) → list view (`/transfers`) should show a **Stale** badge next to Draft.
- Click **Reserve** (visible to admin or From-branch users while draft) → status flips to **Reserved** (amber). In the SQL editor: confirm the serialized stock row's `status = 'reserved'`; confirm the lot row split — a new `stock` row exists with `status = 'reserved'` and `quantity` = the transferred amount, and the original lot row's `quantity` dropped by that amount; confirm `transfer_line_items.stock_id` for the lot line now points at the new split row.
- Click **Dispatch** → dialog requires **Courier** (submit blank → browser validation blocks it); Tracking code and SIS no. are optional. Submit with just courier filled → status flips to **In transit** (blue), `transfers.courier/tracking_code/sis_no/transfer_date` populate. In the SQL editor: confirm both `stock` rows (serialized + split lot) are now `status = 'transferred'`, and two new `stock_movements` rows exist with `movement_type = 'transfer_out'`.
- As a To-branch user (or admin), the detail page should now show the **Receive panel** instead of the plain line table. Click **Received** on the serialized line → status shows "Received"; in the SQL editor confirm that stock row is `branch_id` = To branch, `status = 'available'`, `branch_date_received = today`, and a `transfer_in` movement row was created. Transfer should stay **In transit** (the lot line is still open).
- On the lot line, click **Report issue**, leave the note blank and submit → browser `required` attribute should block it (or, if bypassed, the RPC raises "discrepancy note required" and it surfaces as a toast). Fill in a note and submit → line shows "Discrepancy" status with the note text; transfer flips to **Confirmed** (green) because every line is now resolved (one confirmed, one noted) — this is intentional per the plan's discrepancy semantics (a noted-but-unconfirmed line still counts as resolved; the flagged stock stays `transferred`, not `available`, pending manual adjustment).
- Once confirmed, revisit the detail page — action bar should be empty (no Reserve/Dispatch/Receive controls), lines render as the plain read-only table.
- Draft-only guard: create a second draft, click **Delete draft** → confirms via a browser `window.confirm`, then deletes the transfer and its lines and redirects to `/transfers`. Try calling delete on a non-draft transfer (e.g. by resubmitting an old form) → should be rejected server-side with "Only draft transfers can be deleted."

## 4. Known gaps / things to double check locally

- No generated `Database` type exists in this repo (same situation as Phase 2), so every `.from(...)`/`.rpc(...)` call in the new transfer files is loosely typed — Postgrest will accept a typo'd column or RPC param name at compile time and only fail at runtime.
- The stock search in the line editor re-queries on every `?stockq=` change (full page reload via GET form) rather than client-side filtering — matches the plan's "server-rendered search via `?stockq=` param" spec, but means no live-as-you-type filtering like the intake form's product picker.
- No pagination on the stock search results beyond the hard `limit(50)` — if a from-branch has more than 50 matching available stock rows for a query, the picker won't show the rest; narrow the search text to find them.
- `deleteDraft` does two separate deletes (line items, then the transfer) rather than relying solely on the `on delete cascade` already present on `transfer_line_items.transfer_id` — redundant but harmless; kept explicit so the RLS write-check on `transfer_line_items` is exercised the same way for both delete and edit paths.
- Nav intentionally does not yet link to `/requests` (Stock requests, Task 6) — that's the next task, not part of this drop.

---

# Phase 3 Runbook — Stock requests (Task 6)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. No new migrations — this task only adds UI/actions on top of the `inventory_requests` / `request_line_items` tables (0004) and the `request_serve` RPC (0009), both already pushed in the previous drop.

## 1. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- `src/app/(app)/requests/actions.ts` calls `supabase.rpc('request_serve', { p_request_id, p_from_branch_id })`, matching `0009_transfer_rpcs.sql` exactly. The RPC returns a `uuid` (the new draft transfer's id) — since there's no generated `Database` type in this repo, the client types the RPC result loosely; `serveRequest` guards with `typeof data !== "string"` before redirecting to `/transfers/${data}`. If the RPC ever returns something else shaped, this guard will surface as "Could not serve request." rather than crashing.
- `src/lib/validators/request.ts`'s `createRequestSchema` accepts `lines` as a JSON string (one hidden `<input type="hidden" name="lines">` field holding `JSON.stringify(...)`) rather than repeated FormData keys — this mirrors the add/remove-lines-client-side requirement without extra per-line form plumbing. `parseLinesJson` safely falls through to the raw value on a parse failure so zod's own array validation produces the error message, not a raw JSON exception.
- `src/app/(app)/requests/[id]/page.tsx` deliberately avoids a single `Promise.all` across heterogeneous Supabase query shapes for the optional "requested by" profile lookup (it was originally written that way and rewritten to a plain sequential `if` block) — if you see any other file in this codebase doing conditional-query-in-Promise.all, treat this file's version as the safer pattern to copy, not the other way around.
- `src/app/(app)/requests/[id]/page.tsx` resolves line → product names via a nested `request_line_items` → `products(name)` embed directly (one level, not two like the transfer detail page's stock → products chain) — this is a to-one embed off a table with a single FK to `products`, low risk, but if the embed shape comes back as an array instead of an object at runtime, `firstOrNull` already defends against both shapes (same helper pattern as `transfers/[id]/page.tsx`).
- RLS reminder (`0006_rls.sql`, `req_all`/`rli_all` policies): a `branch_rep` can only see/write requests where `requesting_branch_id = auth_branch()`; `admin`/`top_mgmt` see all. The UI does not re-filter the list query by branch for `branch_rep` — it relies entirely on RLS. If a `branch_rep` ever sees another branch's requests, check the policy, not the page.

## 2. Manual checklist — Stock requests (`/requests`)

```powershell
npm run dev
```

Seed data needed: at least 2 branches, a `branch_rep` test user tied to one of them, and at least one product.

- Nav: confirm "Stock requests" appears under the Transfers section for `admin`, `branch_rep`, and `top_mgmt` roles; a `technical`-role user should be redirected to `/` if they hit `/requests`, `/requests/new`, or `/requests/[id]` directly.
- **Branch rep creates a 2-line request:** log in as the `branch_rep` test user, click **New request** → `/requests/new`. Confirm "Requesting branch" is locked/read-only to their own branch (not a select). Search a product, click it to add a line (defaults to qty 1), search a second product and add it, adjust one line's quantity, add a notes comment, submit. Expect: redirected to `/requests`, new row visible with today's date, correct branch, line count 2, status **Pending**, a notes icon in the last column.
- Try submitting with zero lines → **Submit request** button should be disabled (can't submit an empty request).
- **Admin sees it:** log in as admin, visit `/requests` (no branch filter — admin/top_mgmt see all branches' requests per RLS). Confirm the branch_rep's request appears with the correct "Requested by" name (resolved via the profiles Map, not a Postgrest embed). Filter by status = Pending → row still shows; filter by Processing/Served → row disappears (not yet served).
- Click into the request (`/requests/[id]`). Confirm: status badge Pending, both lines with correct product names and quantities, notes text shown, and an **Admin notes** card (admin-only) with a textarea + "Save admin notes" button.
- Type into admin notes and save → toast "Admin notes saved.", page refreshes, text persists on reload.
- **Serve:** click **Serve request** (visible to admin only, only while status = pending) → dialog opens, "From branch" select excludes the requesting branch itself. Pick a from-branch with available stock, submit. Expect: redirected to `/transfers/[new-id]` — a fresh **Draft** transfer, with "Linked request" shown on its details card (the request's id). Back on `/requests`, the original request now shows status **Processing** and the **Serve request** button/action is gone from its detail page (status is no longer pending).
- **Complete the linked transfer** (reusing Task 3-5 flows): on the new draft transfer, add lines for the requested products/quantities from the from-branch's available stock, click **Reserve**, then **Dispatch** (courier required), then as a to-branch user or admin use the **Receive panel** to confirm every line (or note a discrepancy — either resolves the line per the existing discrepancy semantics).
- Once every line is resolved, confirm the transfer flips to **Confirmed** and, in the same action, the linked request auto-flips to **Served** — this is the `transfer_receive_line` RPC's existing `if v_transfer.request_id is not null then update inventory_requests set status = 'served' ...` branch (0009), not new code from this task. Verify on `/requests`: the request's status badge now reads **Served** with no further admin action available.

## 3. Known gaps / things to double check locally

- No generated `Database` type exists in this repo (same situation as every prior phase), so every `.from(...)`/`.rpc(...)` call in the new requests files is loosely typed — Postgrest will accept a typo'd column or RPC param name at compile time and only fail at runtime.
- The product picker in the new-request form loads the full active product list client-side and filters in memory (same approach as the stock intake form) — fine at current catalog size, would need a server-side search endpoint if the catalog grows much larger.
- No pagination inside a single request's line list (not expected to exceed a handful of lines per request) and no edit/cancel path for a request once submitted — if a branch rep needs to correct a pending request, today the only option is for admin to serve it as-is or leave it pending; consider a "cancel request" action later if that's a real workflow gap.
- `updateAdminNotes` allows saving admin notes at any status (not just pending/processing) — intentional, since notes are a running log an admin may want to append to even after a request is served.

---

# Phase 4 Runbook — Sales, Customers (Tasks 1-2: migration 0011, importers)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` and first `npm run import` as the real first runs.

## 0. Copy the 5 new CSV exports into `data/exports/`

Copy these files from your uploads into `data/exports/` (same folder Phase 1's exports already live in):

- `export_All-Sales-modified--_2026-07-07_05-01-15.csv`
- `export_All-Customers-modified_2026-07-07_05-01-56.csv`
- `export_All-Earmold-Requests-modified_2026-07-07_05-04-14.csv`
- `export_All-Repair-Requests-modified_2026-07-07_05-03-48.csv`
- `export_All-Service-Pricings-modified_2026-07-07_05-03-27.csv`

Only the Sales and Customers files are consumed by this drop (`importSales`/`importCustomers` in `scripts/import/run.ts` look for files starting with `export_All-Sales` and `export_All-Customers`). The Repair-Requests, Earmold-Requests, and the refreshed Service-Pricings file are staged for Phase 5 — copying them now just means they're already in place when that importer work starts; they're inert until then. If a file is temporarily missing, `npm run import` logs a `skip <label>: no export file starting with <prefix>` warning and continues rather than throwing (customers and sales are wired as optional at the `main()` level in `run.ts` for exactly this reason — Josh may re-run with only a subset of files present).

## 1. Push migration 0011

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0011_sales_rpcs.sql` applies cleanly. This migration does three things:
- Adds `sale_line_items.product_id` and loosens the line-type check constraint so a stock line can reference just a `product_id` (no `stock_id`) — needed because many legacy sale rows are non-serialized products (batteries etc.) with no stock lot to link back to.
- Adds `sale_record(...)` (atomic multi-line sale RPC — stock status/quantity flips + line inserts + movement rows) and `sale_return_line(...)` (per-line return with quantity/status bookkeeping). Neither is called by anything yet — Task 3-4 (Record sale UI, returns UI) wires them up next.
- Changes the `customers_read` policy from branch-scoped to `using (true)` for all authenticated users — a deliberate loosening so branch reps can find walk-in customers originally created at a different branch when recording a sale (writes stay branch-scoped via the untouched `customers_write` policy).

Verify in the dashboard: Database → Functions shows `sale_record` and `sale_return_line`; Table Editor → `sale_line_items` has a `product_id` column; Database → Policies → `customers` → `customers_read` reads `true`.

## 2. Run the new unit tests

```powershell
npx vitest run tests/import-customers.test.ts tests/import-sales.test.ts
```

Expected: 4 passed in `import-customers.test.ts` (full row, missing name exception, blank branch → null, unknown branch exception) and 10 passed in `import-sales.test.ts` (2 grouping tests + after-sales-status map coverage + 5 `mapSaleGroup` cases: mixed stock-serial-match + service line, zero-price fallback, unknown branch exception, unresolved stock line exception, unresolved customer name collection).

## 3. Run the full import

```powershell
npm run import
```

Import order is unchanged through transfers, then customers, then sales (`importCustomers` before `importSales` — sales resolves customer names against the customers already in the DB, falling back to auto-create for unmatched walk-ins). Expected new lines in the console output:

```
customers: imported <N>/<N> exceptions -> data/import-reports/customers-exceptions.csv
sales: imported <H> headers, <L> lines (<R> source rows), zero_price lines: <Z>, auto-created customers: <C>
```

followed by the validation report now including `customers`, `sales`, `sale_line_items` row counts.

Notes on what to expect:
- `zero_price lines` counts sale lines where `Total Sale` was blank or zero — these import with `unit_price = 0` rather than being rejected (per the plan, this is a client-review item, not an import failure). It is **not** written to the exceptions CSV; it's a summary count only, so check the console output, not the CSV, for this number.
- `auto-created customers` counts distinct customer names on sale rows that didn't match any imported customer by exact trimmed name — these get a minimal customer row (`name`, `branch_created_id` from the sale's branch, `legacy_id = autocust:<name>`) so sales history stays linked. Re-running the import is safe: the `autocust:` legacy_id makes this idempotent.
- Sale headers upsert on `legacy_id = sale:<first row's unique id>` (prefixed to avoid colliding with that same row's line-level legacy_id, since a header and its own first line can originate from the same CSV row). Lines upsert on `legacy_id = <row's unique id>` directly.

## 4. Review exceptions

Check `data/import-reports/customers-exceptions.csv` and `data/import-reports/sales-exceptions.csv`. Expected cases:
- Customers: any row with a blank `Name`, or a `Branch Created` value that doesn't match an imported branch name.
- Sales: unknown `BranchSold` values (same long tail as Phase 1's stock `Location` exceptions — e.g. "Head Office Sales"), stock lines where neither `SerialNumber` matches an imported stock row nor `Product Name` matches an imported product, service lines with unrecognized `Service Name` values that somehow weren't picked up by the stub-upsert pass (shouldn't happen — flag if you see any), and rows with `quantity` <= 0.

Re-running is safe (idempotent upserts on `legacy_id`) once you've decided how to handle each exception category — same workflow as Phase 1.

## Known gaps / things to double check locally

- No generated `Database` type exists in this repo (same situation as every prior phase), so every `.from(...)` call in `scripts/import/customers.ts` and `scripts/import/sales.ts` is loosely typed against whatever columns you pass — a typo would only surface at runtime.
- `mapSaleGroup` resolves customer name → id via a map built from `customers` ordered by `created_at` ascending, keeping only the first id seen per name (per the plan's "first match by created order" rule) — if two customers were imported with the exact same name, the second becomes permanently unreachable from sales import; this mirrors real-world duplicate-walk-in-record behavior in the Bubble data and was an accepted tradeoff, not a bug.
- `sale_record`/`sale_return_line` RPCs from migration 0011 are not called anywhere yet — Phase 4 Tasks 3-4 (Record sale UI, sales history/returns UI) are next and will wire them up. Importing legacy sales does **not** go through these RPCs (bulk `batchUpsert` instead) since replaying 20k+ rows through a row-locking RPC one at a time would be needlessly slow and the legacy data doesn't need the same-transaction stock-status guarantees a live sale does.
- `sold_by` is left `null` on every imported sale (legacy Bubble `Sold By` is free text, and `profiles` isn't populated from legacy Users) — matches the plan's explicit call-out; only sales recorded through the new UI will have a real `sold_by`.

---

# Phase 4 Runbook — Customers + visits (Task 5)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. No new SQL migration — this task only adds UI/actions on top of the existing `customers`/`visits` tables (0003) and requires one manual Supabase Storage setup step (below).

## 1. Create the `visit-files` Storage bucket

In the Supabase dashboard → Storage → New bucket:
- Name: `visit-files`
- Public: **off** (private bucket — access is via signed URLs only)

Then in the SQL editor, add the storage policies:

```sql
create policy "visit files read" on storage.objects for select to authenticated
  using (bucket_id = 'visit-files');
create policy "visit files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-files');
```

Verify: Storage → `visit-files` bucket exists and shows "Private"; Database → Policies → `storage.objects` shows both new policies.

## 2. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- `src/app/(app)/customers/actions.ts`'s `logVisit` uses `formData.getAll("files")` typed as `FormDataEntryValue[]`, filtered down to `File[]` via an `entry is File` type guard (also requires `entry.size > 0` so an empty file input doesn't create a zero-byte upload attempt) — Next.js server actions support `File` objects directly in `FormData` when the form has no explicit `encType` set (the browser defaults to `multipart/form-data` whenever a `<input type="file">` is present).
- `logVisit` creates the `visits` row **before** uploading any files (needed for the `{customer_id}/{visit_id}/{filename}` storage path), then does a second `update` to attach `attachment_paths` only if at least one file uploaded successfully. Upload failures are counted but do not fail the whole action — the visit is kept and a `warning` string is returned in `VisitActionState` for the toast to surface. If you want failed uploads to block the visit entirely, that's a deliberate deviation from the plan's "keep visit, return warning" instruction — don't change it without checking the plan again.
- No generated `Database` type exists in this repo (same situation as every prior phase), so every `.from(...)`/`.storage.from(...)` call in `src/app/(app)/customers/actions.ts` and `src/components/customers/visit-list.tsx` is loosely typed — Postgrest/Storage will accept a typo'd column, bucket, or path at compile time and only fail at runtime.
- **RLS gap found during self-review, not fixed in this drop:** migration 0011 loosened `customers_read` to `using (true)` for all authenticated users (so branch reps can find walk-in customers created at another branch when recording a sale), but `visits_all` (0006_rls.sql) still requires `branch_created_id = auth_branch()` on the linked customer for non-admin/non-top_mgmt writes. Net effect: a `branch_rep` can *see* a customer created at a different branch (list, detail, purchase history) but `logVisit` will fail RLS silently (surfaces as the generic "Could not log visit." toast) if they try to log a visit for that customer. If this turns out to matter in practice — e.g. a customer who travels between branches — the fix is a small follow-up migration loosening `visits_all`'s write check the same way 0011 loosened `customers_read`, not a UI change.
- `src/components/customers/customer-info-card.tsx` overrides `CardHeader`'s default `flex-col` with `flex-row items-center justify-between` via `className` — this is the first place in the codebase to override that base layout; if another card ever needs an inline action button next to its title, copy this pattern rather than adding a new shared component.

## 3. Manual checklist — Customers (`/customers`)

```powershell
npm run dev
```

- Nav: confirm a new "Customers" section with a "Customers" link appears for `admin`, `branch_rep`, and `top_mgmt` roles, positioned after "Sales" in the sidebar; a `technical`-role user should be redirected to `/` if they hit `/customers` or `/customers/[id]` directly.
- Visit `/customers`. Empty state or existing imported customers (from Phase 4 Task 1-2's import) should list, 50 per page, sorted newest-created first.
- Search box: type part of a name or mobile number, Apply → list filters to matches (case-insensitive, partial match on either field).
- Click **New customer** → dialog opens. Leave name blank, submit → inline "Name is required" error, dialog stays open. Fill name only, submit → dialog closes, new row appears at the top of the list (sorted by created_at desc).
- Click a customer's name → navigates to `/customers/[id]`. Confirm the info card shows mobile/email/date of birth/address (or "—" for blanks).
- Click **Edit** on the info card → dialog opens pre-filled, change a field (e.g. add a mobile number), save → dialog closes, card updates without a full page reload feel (revalidatePath refresh).

## 4. Manual checklist — Visits and purchases (`/customers/[id]`)

Seed data needed: at least one customer, ideally one with an existing sale recorded against them (from Phase 4 Task 3-4's Record sale flow) to exercise the purchases section.

- **Log a visit with a photo:** on a customer detail page, scroll to "Log a visit". Confirm Visit date defaults to today. Pick a purpose from the dropdown (Consultation, Hearing Test, Fitting, Follow-up, Repair Drop-off, Pickup, Other), type a remark, attach one image file, check "Purchase made during this visit", submit. Expect: success toast "Visit logged.", form resets to defaults, a new entry appears at the top of "Visit history" with the date, purpose badge, a green "Purchase made" badge, the remark text, and a clickable attachment link showing the filename.
- **Attachment link opens:** click the attachment filename link → opens the file in a new tab via a signed URL (valid 1 hour). If it shows "(unavailable)" instead of a link, check that the `visit-files` bucket and its two storage policies from step 1 were actually created — this is the most likely failure mode on first run.
- **Multiple files:** log a second visit attaching 2 files (one image, one PDF) → both should appear as separate links under that visit entry.
- **No purpose / no files:** log a visit with only the date filled (leave purpose at its default "Consultation", no files, no remarks) → should still succeed with no attachment links shown for that entry.
- **Purchases show after recording a sale:** from `/sales/new`, record a new sale against this same customer (any line), submit. Return to `/customers/[id]` → the "Purchases" section should now show a new row with the sale's date, OR no. (or "—"), and net total matching the sale detail page's net figure; clicking the date links to `/sales/[id]`.

## 5. Known gaps / things to double check locally

- No generated `Database` type exists in this repo — same caveat as every prior phase's runbook section.
- Purchases section is capped at the latest 20 sales per customer (`PURCHASES_LIMIT` in `src/app/(app)/customers/[id]/page.tsx`) with no pagination — acceptable for now given expected purchase volume per customer; revisit if a customer accumulates more than 20 lifetime purchases and needs to see older ones.
- The RLS gap noted above (branch_rep cannot log visits for customers created at another branch, despite being able to see them) is the one item from this task worth a product decision before go-live — flag it to Josh explicitly, don't assume it's fine.
- `sanitizeFilename` strips everything except alphanumerics, `.`, `_`, `-` — a file named e.g. `José's photo (1).jpg` becomes `Jos_'s_photo__1_.jpg`... actually apostrophes and parens also get replaced, so it becomes `Jos_s_photo_1_.jpg`. This is intentional (safe storage keys) but means the original filename shown as the link text in `visit-list.tsx` is the *sanitized* name, not what the user originally uploaded — acceptable tradeoff, just don't be surprised if the displayed filename looks slightly mangled for names with special characters.

---

# Phase 5–7 — Repairs, portal, reports/VAT, user admin (2026-07-11)

## 1. Environment / config additions

- **Server env (Vercel/production AND `.env.local`)**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already used by tests/imports; now also used at runtime by `src/lib/supabase/admin.ts` — the ONLY module allowed to import it, guarded by `server-only`), and `SITE_URL` (e.g. `https://app.example.com`; falls back to `http://localhost:3000`). Never prefix these with `NEXT_PUBLIC_`.
- **Supabase Auth dashboard**: add `<SITE_URL>/auth/confirm` and `<SITE_URL>/reset-password` to the redirect URL allowlist, or invite/recovery email links will bounce.
- Migrations `0013`–`0017` (`npm run db:push`): repairs RPCs + `profiles_read` policy + `rate_limits`; VAT param on `sale_record` + `sales_totals` rebuilt with `security_invoker = on` (fixes a definer-semantics leak) ; report views + `stock_movements` indexes; `auth_role()/auth_branch()` enforce `is_active`; RLS InitPlan rewrite for the 28k-row sales tables (statement-timeout fix) + `sales(branch_id)`/`sales(sale_date)` indexes.

## 2. Manual checklist — Repairs (`/repairs`) + public portal (`/repair-status`)

- Intake from a sold serialized item ("From sale" tab prefills customer + contact) or via manual serial. Blank SAR auto-generates `SAR-YYMMDD-XXXX`; a duplicate manual SAR shows a clean error.
- Detail page: add status updates (Received → Assessed → In Repair → Ready → Returned); "Returned" flips the header to Completed and stamps the return date. Uncheck "Visible to customer" for internal notes — they get a lock badge and never reach the portal.
- "Copy status link" emits `/repair-status?sar=...`. Open it in incognito: SAR prefilled, wrong phone → generic "No repair found" (same message for unknown SAR / rate limit — anti-enumeration), correct phone (any format: +63/0917/spaced) → public timeline only. Per-SAR limit: 5 attempts/hour; per-IP: 10/10min.

## 3. Manual checklist — VAT + reports

- `/sales/new`: VAT auto-computes 12/112 of (gross − discount) and re-syncs until manually edited; "VAT-exempt (set to 0)" and "Recompute" links. Detail page shows VAT and Net-of-VAT; legacy sales show "—".
- **Never backfill `vat_amount` on imported sales** — null means "not captured", and reports footnote it.
- `/reports/sales`: monthly chart + table with gross/discounts/net/VAT/net-of-VAT and CSV export at per-sale grain (the accounting export). `/reports/movements`: filterable ledger + CSV. Branch reps are auto-scoped; the branch filter only renders for admin/top_mgmt.

## 4. Manual checklist — User admin (`/admin/users`) + password reset

- Admin-only. Invite (sends Supabase invite email → user lands on `/reset-password` to set a password), edit role/branch, deactivate/reactivate. Deactivation bans the auth user (blocks sign-in + refresh) AND `is_active=false` fails every `auth_role()` RLS check; residual exposure is bounded by the ~1h access-token TTL on the few `using (true)` policies.
- You cannot deactivate your own account (guarded server-side).
- "Forgot password?" on the login page → `/forgot-password` (always reports success — no account enumeration) → email link → `/auth/confirm` → `/reset-password`.

## 5. Known gaps / notes

- Repair intake deliberately does not touch `stock` or write `repair_in`/`repair_out` movements (customer-owned units); those movement types are reserved for repair-pool loaner tracking.
- Repair intake's "From sale" search preloads the newest 500 serialized sold lines (`SOLD_ITEM_CAP`); switch to server-side search if intake regularly needs older sales.
- `rate_limits` is fixed-window and self-cleaning; no cron needed.
- If any other report over `sales`/`sale_line_items`/`stock` times out for branch users, apply the `(select auth_role())` InitPlan rewrite from `0017` to that table's policies — `stock`'s policies still use the per-row form.
