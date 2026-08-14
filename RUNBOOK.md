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

# Phase 6 (Items 1-2) — Repair-pool filter + repair/earmold status lockdown (2026-07-22)

## 1. Push the schema

```
npx supabase db push -p "<db password from .env.local>"
```

Expected: migration `0020_repair_status_rls.sql` applied. It drops the old blanket `repairs_all` / `rse_all` / `earmold_all` policies and recreates select/insert/update policies (`repairs_select/insert/update`, `rse_select/insert/update`, `earmold_select/insert/update`), then recreates `repair_add_event` with an `auth_role() in ('admin','technical')` guard at the top. No migration was needed for `is_repair_pool` visibility — `stock_visible` (migration `0010`) already exposes that column.

## 2. Build

```
npm run build
```

Watch for TS errors in `src/components/transfers/line-editor.tsx`, `src/app/(app)/inventory/page.tsx`, `src/app/(app)/transfers/[id]/page.tsx`, `src/app/(app)/repairs/[id]/page.tsx`, `src/app/(app)/earmolds/[id]/page.tsx`.

## 3. Manual checklist

- **Transfer picker defaults to sellable stock**: open a draft transfer from a branch holding both sellable and repair-pool stock. The stock picker shows only sellable items by default ("Sellable" segment highlighted). Switching to "Repair pool" reveals only pool items; "All" shows both.
- **Repair-pool filter reveals pool items**: added lines and picker rows for pool stock show an amber "Repair pool" badge. A mixed transfer (some sellable, some pool lines) is visually distinguishable at a glance.
- **Inventory page pool filter**: `/inventory` defaults to sellable stock (`?pool=` absent or `sellable`). Switching the "Stock pool" dropdown to "Repair pool" or "All" updates the list and survives Previous/Next pagination links (check the URL carries `pool=repair` etc.).
- **Branch rep sees no repair status controls but can create**: log in as a `branch_rep`. `/repairs/new` and `/earmolds/new` are reachable and submit successfully. On `/repairs/[id]` and `/earmolds/[id]` for that branch's own records, no status/event form, no "Edit" (assignment) dialog, no advance-status button appears — only the read-only timeline/badge.
- **Technical can advance status**: log in as `technical`. Repair and earmold detail pages show the status/event form and (for repairs) the edit/assignment dialog; submitting a status change succeeds and the timeline updates.
- **Admin can do both**: admin sees creation, status controls, and assignment on both entities.
- **RPC-level enforcement**: with a branch_rep or top_mgmt session, calling `repair_add_event` directly (e.g. via browser devtools `supabase.rpc(...)`) should fail with `not authorized to update repair status`. A direct `update`/`insert` against `repair_status_events`, `repair_requests`, or `earmold_requests` from a non-admin/technical session should be rejected by RLS.

# Phase 6 (Item 4) — Chat restricted to HQ ↔ branch only (2026-07-22)

## 1. Push the schema

```
npx supabase db push -p "<db password from .env.local>"
```

Expected: migration `0021_chat_hq_only.sql` applied. It adds `branches.is_head_office` (default `false`), sets it `true` for the branch with `code = 'HQ'` ("EDI HQ"), and recreates the `chat_insert` policy on `chat_messages` so a branch-pair message now additionally requires that `branch_a_id`/`branch_b_id` includes a head-office branch. Existing branch-to-branch rows (e.g. any historical pair not involving HQ) are left in place for history but can no longer be written to, and the UI no longer offers a path to them.

Verify:
```sql
select code, name, is_head_office from branches order by is_head_office desc;
```
Exactly one row (`code = 'HQ'`) should have `is_head_office = true`.

## 2. Build

```
npm run build
```

Watch for TS errors in `src/lib/chat.ts`, `src/components/chat/chat-widget.tsx`, `src/components/app-shell.tsx`.

## 3. Manual checklist

- **Branch rep sees only General + Head office**: log in as a `branch_rep` whose `branch_id` is a normal (non-HQ) branch. The chat channel dropdown shows exactly two options: "General — whole organization" and "Head office". No other branch names appear.
- **HQ user can pick any branch**: log in as a user whose `branch_id` is the HQ branch (`code = 'HQ'`), or as a branchless `admin`/`top_mgmt` user. The dropdown shows "General" plus one entry per non-HQ branch ("Chat with <branch>"); selecting one opens that branch's HQ channel and messages land there.
- **No path to branch-to-branch**: there is no UI control anywhere that lets two non-HQ branches pick each other — the old "Between two branches…" pair picker is gone.
- **RLS rejects a hand-crafted branch-to-branch insert**: with any authenticated session, `supabase.from('chat_messages').insert({ branch_a_id: <branchX>, branch_b_id: <branchY>, sender_id: ..., body: 'test' })` where neither branch is HQ should fail (RLS policy violation). The same insert with one side set to the HQ branch id (and the sender authorized for that pair) should succeed.
- **Defensive fallback**: if `is_head_office` is ever `false` for every branch, branch/HQ-picker options disappear and only "General" is shown — confirm this doesn't crash the widget (can be checked by temporarily setting `is_head_office = false` everywhere in a scratch/staging DB, not production).

# Phase 6 (Item 3) — Admin reversals + serial corrections (2026-07-22)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. This is the largest and most sensitive item in Phase 6 — it touches stock and money — review the checklist carefully before trusting it in front of the client.

## 1. Push the schema

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: migration `0022_admin_corrections.sql` applied. It adds:
- `admin_corrections` table (admin-only RLS) — every void/reversal/correction writes a before/after jsonb snapshot row here.
- `sales.voided_at` / `voided_by` / `void_reason`; `repair_requests.voided_at` / `void_reason`; `earmold_requests.voided_at` / `void_reason`; `transfers.reversed_at` / `reversed_by` / `reverse_reason`.
- Six new `security definer` RPCs, each admin-gated and reason-required: `sale_void`, `intake_void`, `transfer_reverse`, `serial_correct`, `repair_void`, `earmold_void`.

Verify in the dashboard: Database → Tables shows `admin_corrections`; Database → Functions shows all six new functions (language `plpgsql`, security definer); Table Editor → `sales`/`transfers`/`repair_requests`/`earmold_requests` show the new columns.

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- `src/components/inventory/stock-table.tsx`, `src/components/transfers/line-editor.tsx`, and the four detail pages (`sales/[id]`, `transfers/[id]`, `repairs/[id]`, `earmolds/[id]`) all pass a server action (`voidSale`, `voidIntake`, `reverseTransfer`, `correctSerial`, `voidRepair`, `voidEarmold`) as a prop into the shared `VoidDialog`/`SerialCorrectDialog` client components — standard Next.js Server Action-as-prop pattern, but double-check it compiles given this repo's React/Next versions.
- No generated `Database` type exists in this repo (same caveat as every prior phase), so every `.rpc(...)` call against the six new functions is loosely typed — a typo'd param name only surfaces at runtime as a Postgres "function not found" error.
- `src/app/repair-status/actions.ts` now filters `.is("voided_at", null)` on the public SAR lookup query — there is **no** separate SQL `portal_lookup` function in this codebase (the plan referenced one that doesn't exist as written; the actual lookup is this inline query), so the filter was added directly there instead of "recreating" a nonexistent function.

## 3. Manual checklist — sale void

- Record a test sale (serialized or lot line, doesn't matter) as any user, then as **admin** open its detail page. Confirm a **"Void sale"** button appears next to Print (admin-only, hidden once the sale is voided).
- Click it → dialog requires a reason; Submit stays disabled until you type one. Submit with a reason.
- Expect: sale detail now shows a red **"VOIDED — <reason> · <admin name> · <date>"** banner; every line's Return button is gone (voided sales can't be further returned); the line(s) show `after_sales_status = Returned`.
- In the SQL editor: the stock row involved is back to `status = 'available'` (serialized) or its `quantity` increased by the sold amount (lot); a new `stock_movements` row exists with `movement_type = 'return'` and a note starting `void: `.
- Visit `/admin/corrections` → a new row: entity **Sale**, action **void**, your admin name, the reason, and expandable **Before/After** JSON showing the sale + line snapshots.
- Confirm the voided sale no longer appears in `/sales` (default list excludes `voided_at is not null`).
- Try voiding the same sale again (e.g. resubmit) → rejected with "sale already voided".

## 4. Manual checklist — intake void (refuse-if-touched)

- On `/inventory` as admin, find (or create via Stock intake) a fresh, untouched stock row. Confirm each row now has a small pencil icon next to its serial and a **"Void intake"** button (admin-only).
- Void it → dialog requires a reason. Submit. Expect: the row disappears entirely from `/inventory` (hard-deleted, not soft-deleted) and a corrections-log entry appears with entity **Stock intake**, action **void**, `after_data: null`.
- Now try voiding a stock row that has been sold, transferred, or partially consumed (quantity ≠ original_quantity) → expect the RPC to reject with **"stock has activity — cannot void"** (surfaced as a toast) and the row to remain untouched.

## 5. Manual checklist — transfer reverse

- Take a transfer through to **Confirmed** status (reuse the Phase 3 checklist flow: draft → reserve → dispatch → receive every line).
- As admin, open the confirmed transfer's detail page → a **"Reverse transfer"** button appears (only while `status = confirmed` and not already reversed).
- Click it, provide a reason, submit. Expect: the transfer's status badge **stays "Confirmed"** (history stays truthful, per the plan) but a red **"REVERSED — <reason> · <admin> · <date>"** banner appears above the details card.
- In the SQL editor: the transferred stock is back at the origin branch, `status = 'available'`; two new `stock_movements` rows exist per line (`transfer_out` then `transfer_in`, note starting `reversal: `, direction destination → origin).
- Corrections log shows entity **Transfer**, action **void**, with before/after snapshots of the transfer + its lines.
- Try reversing the same transfer again → rejected with "transfer already reversed". Try reversing a transfer still in draft/reserved/in_transit → rejected with "transfer not confirmed".

## 6. Manual checklist — serial correction

- On a **sale line** (sale detail page): as admin, click the pencil next to a stock line's serial. Dialog requires both a new serial and a reason.
- Submit a corrected serial. Expect: the line's serial updates immediately on refresh; if that line's `stock_id` matches a stock row, correcting via the **stock** scope (see next bullet) cascades to this same line automatically — the two scopes serve different situations (see file comments in `0022_admin_corrections.sql`).
- On `/inventory`, correct a stock row's serial via its pencil icon. Then open a sale or transfer that references that same stock — its serial should now also read the corrected value (confirms the `serial_snapshot` cascade on `sale_line_items`/`transfer_line_items`).
- Try correcting a stock serial to a value that already exists on a different stock row → rejected with "serial already in use".
- On a repair detail page (a repair created via **manual serial**, not linked to a sale), correct its serial via the pencil next to "Serial". Then try the same on a repair that **is** linked to a sale line → rejected with a message directing you to correct it via the sale line instead.
- Every correction appears in `/admin/corrections` as entity **Serial**, action **edit**, with `before_data`/`after_data` showing `{"scope": ..., "row": {...}}`.

## 7. Manual checklist — repair / earmold void

- On a repair detail page, admin sees a **"Void repair"** button (hidden once voided). Void with a reason → red VOIDED banner appears, the status/event form and edit dialog disappear, and the repair drops out of `/repairs`' default list.
- Confirm the public portal (`/repair-status`) no longer returns this repair for its SAR number + phone (generic "No repair found" message, same as an unknown SAR — by design, no enumeration signal).
- Same flow for an earmold request: **"Void request"** button, VOIDED banner, status button disappears, request drops out of `/earmolds`.

## 8. Manual checklist — non-admin has no access

- Log in as a `branch_rep`, `technical`, or `top_mgmt` user. Confirm **none** of the void buttons, "Reverse transfer" button, or serial-correction pencils appear anywhere (sale/transfer/repair/earmold detail, `/inventory`).
- Confirm `/admin/corrections` redirects non-admins to `/`.
- With a non-admin session, call one of the RPCs directly (e.g. via browser devtools `supabase.rpc('sale_void', { p_sale_id: '<any-uuid>', p_reason: 'test' })`) → expect it to fail with **"admin only"**, proving the RPC-level guard holds even if a UI gate were ever bypassed.

## 9. Known gaps / things to double check locally

- No generated `Database` type exists in this repo (same situation as every prior phase) — every new `.rpc(...)` call is loosely typed.
- `admin_corrections.entity_id` isn't a foreign key to any specific table (it can point at `sales`, `stock` — now possibly deleted — `transfers`, `repair_requests`, or `earmold_requests` depending on `entity`), so there's no referential integrity there by design; the before/after jsonb snapshots are the durable record even after a `stock_intake` void hard-deletes the row.
- `serial_correct` scope `'repair'` only updates `manual_serial` and deliberately refuses when the repair is linked to a sale line (its serial comes from that line instead) — this is a design decision made during implementation since the plan's spec for this scope was underspecified; flag to Josh if repairs commonly need serial correction on the *linked-sale* path too, since today that requires using the sale-line pencil instead.
- The plan referenced a SQL function called `portal_lookup` in migration `0013` to be "recreated" with a `voided_at is null` filter — no such function exists anywhere in this codebase (the public lookup has always been a plain query in `src/app/repair-status/actions.ts`). The filter was added there directly; nothing was recreated.
- Reversing a transfer or voiding a sale does not attempt to auto-reconcile any downstream repair/earmold records that might reference the same stock — if a unit was later sent for repair after a sale that then gets voided, that's a manual follow-up, not something the RPC detects.

# Phase 6 (Item 5) — Top Management analytics dashboard (2026-07-22)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build.

## 1. Push the schema

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: migration `0023_analytics_views.sql` applied. It adds two `security_invoker = off` views — `analytics_sales_by_product` (product/category/branch/month grain, with `units`, `revenue`, `cost`) and `analytics_sales_by_service` (service/branch/month grain, `units`/`revenue`, no cost) — each filtering `where ... and auth_role() in ('admin','top_mgmt')` **inside** the view body (the security-critical bit: since the view runs as its owner, not the caller, RLS on the underlying `sales`/`sale_line_items` tables is bypassed, so this in-view role check is the only thing stopping a branch_rep/technical session from reading everything through it). Both exclude voided sales (`s.voided_at is null`, depends on `0022_admin_corrections.sql`) and non-serialized/service line mismatches via `line_type`. Granted to `authenticated`, revoked from `anon`.

Verify in the dashboard: Database → Views shows both; Database → Policies is irrelevant here (views, not RLS-protected tables) — instead confirm via SQL editor as a non-admin test user (or by temporarily checking `auth_role()` output) that `select count(*) from analytics_sales_by_product` returns 0 for a branch_rep/technical session and non-zero for admin/top_mgmt.

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- `src/app/(app)/analytics/query.ts` is the single source of truth for filter parsing, previous-period math, fetches, and all aggregation (SKU/service/branch rollups, monthly trend pivot) — both `page.tsx` and the three `export/*/route.ts` CSV routes import from it so the on-screen tables and their exports can't drift, same pattern as `reports/sales/query.ts`.
- No generated `Database` type exists in this repo (same caveat as every prior phase) — every `.from("analytics_sales_by_product"|"analytics_sales_by_service")` call is loosely typed; a typo'd column name only surfaces at runtime.
- `src/components/analytics/trend-chart.tsx`, `sku-table.tsx`, `service-table.tsx`, and `branch-table.tsx` all import types (`SkuAgg`, `ServiceAgg`, `BranchAgg`, `TrendSeries`) from `@/app/(app)/analytics/query` via `import type` — this is a components-directory file importing from inside a route group (`(app)`), which is unusual for this codebase (existing report components keep their query helper local to the route folder) but is a plain type-only import, erased at compile time, so it doesn't create a runtime dependency or a client/server boundary problem.
- `recharts` (`^3.9.2`) was **already a dependency** (used by `src/components/reports/sales-chart.tsx`) — no new package was added. The trend chart is a `LineChart` with one `Line` per branch (capped at the top 6 by total revenue + an "Others" series), following the same styling conventions as `SalesChart`.
- KPI "Branches with sales" and the branch performance table both count/include a branch based on having *any* sale-line activity in the period, not `revenue > 0` — deliberate, so a branch whose only activity is a zero-price legacy line doesn't disappear from the KPI while still appearing in the branch table below it.
- "Average sale value" is computed from a direct `sales` table count (`voided_at is null`, date + branch filtered) divided by total revenue from the two views — the views themselves have no sale-level grain (they're pre-aggregated by product/service), so this KPI deliberately reads `sales` directly rather than trying to derive a sale count from view rows.

## 3. Manual checklist

- **top_mgmt sees Analytics with cross-branch numbers**: log in as `top_mgmt` (or `admin`). Sidebar shows an "Analytics" link under Reports. Open it — KPI row (revenue, units, margin, branches with sales, average sale value, each with a vs-previous-period delta), a monthly revenue trend chart, and three ranked tables (SKUs, services, branches) all populate with data spanning every branch, not just one.
- **branch_rep has no link and is redirected**: log in as `branch_rep` or `technical`. No "Analytics" link in the sidebar. Navigating directly to `/analytics` redirects to `/`.
- **Filters work**: change From/To dates, pick a branch, pick a category, click Apply — the URL carries `?from=&to=&branch=&category=`, and every KPI/table/chart reflects the filtered scope. Click Reset — returns to the last-12-months, all-branches default.
- **SKU sort toggle**: click "Units" vs "Revenue" column headers on the Best-selling SKUs table — the table re-sorts and the active column is bolded; the URL's `?sort=` updates and survives an Apply on the filter form (hidden `sort` input).
- **CSV export**: click each of the three "Export CSV" buttons (SKUs, services, branches) — each downloads a CSV matching the current filters (SKU export also respects the current sort). Unlike the on-screen top-20 SKU table, the SKU CSV export includes **all** matching products, not just the top 20 — intentional, flag if a client expects the export capped to match the screen.
- **Branch rank movement**: with at least two periods of data, confirm the branch table's "vs previous" column shows an up/down arrow with the rank delta, "No change", or "New" (branch had no revenue in the immediately-preceding equal-length period).
- **Legacy data note**: the dismissible amber note about zero-price legacy lines appears on first visit; clicking its X hides it and it stays hidden on reload (localStorage, same pattern as the welcome tour) for that browser.
- **Empty-state handling**: pick a filter combination with zero matching sales (e.g. a future date range) — KPIs show ₱0/0 with "n/a" deltas, the trend chart and all three tables show their "No … in the selected period" empty-state row instead of erroring.
- **RLS holds even off the UI**: with a branch_rep or technical session, `supabase.from('analytics_sales_by_product').select('*')` (or `analytics_sales_by_service`) directly via devtools should return **zero rows** (not an error — the `auth_role()` filter inside the view just excludes everything for that role). This is the load-bearing security check for this whole feature; verify it explicitly rather than trusting the UI redirect alone.

## 4. Known gaps / things to double check locally

- No generated `Database` type exists in this repo — same caveat as every prior phase.
- The previous-period comparison is computed at month granularity (matches the views' `date_trunc('month', ...)` grain): both the current and previous ranges get truncated to whole months before comparison, so a custom `from`/`to` that lands mid-month will compare against whole preceding months, not a day-for-day mirror. This mirrors an existing quirk already present in `reports/sales`'s own `.gte("month", filters.from)` filtering (a custom `from` date after the 1st of its month can under-include that month's row) — not a new bug introduced here, just inherited from the same pattern.
- Trend chart caps at the top 6 branches by total revenue for the selected period, folding the rest into "Others" — if a client wants every branch broken out regardless of count, that's a follow-up, not a bug.
- "Average sale value" ignores the category filter (a single sale can mix categories, so category-scoping a whole-sale count doesn't have a clean meaning) — the SKU/service/branch tables and the rest of the KPIs do respect the category filter.

# Phase 6b — Client feedback round 2: duplicate-serial guard (BUG), stock edit, sales CSV (2026-07-22)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint, Glob avoided per `(app)` path issue). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. Migrations used: `0024_intake_dedupe_guard.sql`, `0025_stock_edit.sql`.

## 1. Push the schema

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected:
- `0024_intake_dedupe_guard.sql` — `create or replace function stock_intake(...)`, same signature as `0007`, with two changes ahead of any insert: (a) the incoming serial array is trimmed, empties dropped, and de-duplicated (`array_agg(distinct ...)`); (b) every serial in that cleaned batch is checked against existing `stock` rows (case-insensitive, trimmed) **before any insert happens** — a batch with one bad serial fails cleanly with `serial % already in stock at % (%)` (branch name, status) rather than half-importing. Also adds a `stock_duplicate_serials` view (`security_invoker = on`, rides the existing admin/top_mgmt-only `stock_read` policy) listing every stock row whose serial collides with another. **No hard unique constraint was added** to `stock.serial_number` — legacy imported data may already have duplicates; a commented cleanup query is in the migration file for later use.
- `0025_stock_edit.sql` — new `security definer` RPC `stock_edit(...)`, admin-gated, reason required, row-locked, writes an `admin_corrections` row (`entity = 'stock'`, `action = 'edit'`) exactly like the RPCs in `0022`. Refuses to run once a stock row has moved past `available/reserved/under_repair/for_replacement/consignment` ("stock has moved — use a correction instead"). Never touches `serial_number` or `quantity`.

Verify in the dashboard: Database → Functions shows `stock_intake` (unchanged signature, `plpgsql`, not security definer — matches `0007`) and `stock_edit` (`plpgsql`, security definer). Database → Views shows `stock_duplicate_serials`.

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- No generated `Database` type exists in this repo (same caveat as every prior phase) — every new `.rpc(...)` / `.from("stock_duplicate_serials")` call is loosely typed; a typo'd param or column name only surfaces at runtime.
- `src/app/(app)/sales/export/route.ts` is new and duplicates a fair amount of `/sales`'s filter-resolution logic (`src/app/(app)/sales/page.tsx`) rather than importing a shared helper — unlike `reports/sales`, there's no existing `query.ts` shared between `/sales` and this export, so filter drift is a real risk if `/sales`'s filters ever change; if you touch one, touch the other.
- `src/lib/validators/correction.ts` gained a second, unexported `optionalText`/`requiredDate`/`optionalDate`/`nonNegativeCost` block below the existing schemas (for `stockEditSchema`) — deliberately not merged with the file's original `toOptionalText`-based consts up top; check this compiles cleanly, no naming collisions were intended but double check given both blocks share `toOptionalText`.

## 3. Manual checklist — intake duplicate guard (item 1, BUG — test first)

- On `/inventory/intake` as admin, pick a serialized product, paste **the same serial number twice** (with different casing/whitespace, e.g. `SN-001` and ` sn-001 `) plus one more unique serial, submit. Expect: exactly **one** row created for the duplicated serial (not two) and one for the unique serial — 2 rows total, "2 units received."
- Intake a serial (e.g. `SN-100`), submit successfully. Then try to intake `SN-100` again (same or different branch) → expect a clean rejection toast naming the branch and status, e.g. **"serial SN-100 already in stock at <branch> (available)"** — not a generic error, and no new row created.
- Intake a batch of 3 serials where the 2nd one already exists in stock → expect the **whole batch to fail** (0 new rows), not 1 succeeding and 2 failing partial import. Confirm in the SQL editor that no new `stock` rows exist for any of the 3.
- Confirm the hint text "Duplicate serials are ignored; serials already in stock will be rejected." appears under the serial textarea on `/inventory/intake`.
- Visit `/admin/duplicates` (new nav link under Admin, admin-only). If any legacy duplicate serials exist in the imported data, they list here grouped implicitly by serial (sorted by serial), each row showing product, branch, status, quantity, received date. A non-admin hitting this URL directly should redirect to `/`.

## 4. Manual checklist — stock edit (item 3)

- On `/inventory` as admin, each row now shows an **Edit** button next to **Void intake**. Click it → dialog opens pre-filled with the current product, cost, invoice no./date, expiry, repair-pool/office-asset checkboxes.
- Change the product (search/select a different one) and the invoice no., leave a reason, save. Expect: toast "Stock updated.", row's product name updates on `/inventory`.
- Visit `/admin/corrections` → a new row: entity **Stock**, action **edit**, your admin name, the reason, expandable Before/After JSON showing the product_id/invoice fields changed (and unchanged `serial_number`/`quantity`).
- Change only the cost per unit, save → confirm `total_cost` in the SQL editor recomputed as `cost_per_unit * quantity` for that row.
- Try editing a stock row that has already been sold/transferred (status outside available/reserved/under_repair/for_replacement/consignment) → expect the RPC to reject with **"stock has moved — use a correction instead"**.
- Submit with no reason → Save button stays disabled (client-side), and if bypassed, the RPC itself rejects with "reason required".
- As a non-admin, confirm no Edit button appears anywhere on `/inventory`, and calling `stock_edit` directly via devtools fails with "admin only".

## 5. Manual checklist — sales CSV export (item 2)

- On `/sales`, an **Export CSV** button now sits next to **Record sale** (visible to admin, branch_rep, top_mgmt — everyone who can view sales history; branch_rep's export is scoped to their own branch by RLS, not by hiding the button).
- Apply some filters (date range, branch [admin/top_mgmt only], search term), click Export CSV → confirm the downloaded filename is `sales-history-<date>.csv` and its rows match what's currently filtered on screen (one row per sale line item, not per sale — a 3-line sale produces 3 CSV rows).
- Confirm columns: Sale date, OR no., CSI no., CI no., Customer, Branch, Sold by, Line type, Product/service, Serial, Quantity, Unit price, Line total, Discount, Paid, After-sales status, Voided. Discount is populated only on each sale's **first** CSV row (documented in the route file) — don't sum it per-line or it'll be double-counted.
- Void a test sale, then export again with a date range covering it → confirm the voided sale **still appears** in the CSV with `Voided = yes` (voided sales are excluded from the on-screen list but not from the export — accounting needs them).
- **Cost-leak check (do this one explicitly):** log in as a `branch_rep`, export CSV → open the file and confirm there is **no** cost-per-unit or unit-cost column anywhere, and every row's Branch column is the rep's own branch only. Log in as admin/top_mgmt, export the same date range → confirm rows span multiple branches and still have no cost column (cost is intentionally excluded for everyone, not just branch reps — this export isn't a costing report).

## 6. Known gaps / things to double check locally

- No generated `Database` type exists in this repo — same caveat as every prior phase.
- `stock_duplicate_serials` does a self-join with `lower(trim(serial_number))` equality and no supporting expression index — fine at current data volume (~20k stock rows), revisit if the duplicates list becomes slow to load.
- The sales CSV export re-derives `/sales`'s q-search and branch-locking logic inline (see build note above) rather than sharing a `query.ts` module the way `/reports/sales` does — a deliberate scope-limiting choice for this session; consider factoring it out if `/sales`'s filters grow more complex.
- `stock_edit` always recomputes `total_cost = cost_per_unit * quantity` (even when cost is unchanged) rather than conditionally recomputing only on a real change — harmless since the result is identical either way, just simpler code than the spec's literal "when cost changes" wording.
- `submitIntake` (`src/app/(app)/inventory/intake/actions.ts`) previously swallowed every RPC error behind a generic "Could not record stock intake." message — fixed in this session to surface the RPC's real message (needed so the new duplicate-serial rejection text actually reaches the user); flagged here since the task description implied this already worked and it did not.

---

# Phase 6c Runbook — Items A-B (SIS/courier separation, partial receiving)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build.

## 1. Push migration 0027

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0027_transfer_partial_receiving.sql` applies cleanly. It adds `transfer_line_items.received_quantity` (numeric, nullable) and replaces `transfer_receive_line` — the old 3-arg `(p_line_id uuid, p_confirm boolean, p_note text)` overload is explicitly dropped and a new one, `(p_line_id uuid, p_received_quantity numeric, p_note text default null)`, is created. Verify in the dashboard: Database → Functions → `transfer_receive_line` shows only one entry now, with the new 3-param signature; Table Editor → `transfer_line_items` has the new `received_quantity` column.

Item A (SIS vs courier) needed **no migration** — `transfers.sis_no`, `courier`, `tracking_code` and the `transfer_dispatch(p_transfer_id, p_courier, p_tracking_code, p_sis_no)` RPC already existed from 0009 with all three params wired through `dispatchTransferSchema` → `dispatchTransfer` action → RPC. This session only reordered/relabeled the three dispatch-dialog inputs and split the transfer-detail header's combined "Tracking / SIS" line into two separately labeled lines.

## 2. How dispatch/reserve leave stock (verified before writing the split logic)

- `transfer_reserve` (0009, unchanged): a full-row line marks the existing stock row `'reserved'` in place, still at the origin `branch_id`. A partial-quantity line splits a **new** stock row off at the origin branch (`status 'reserved'`, `quantity = line.quantity`) and repoints `transfer_line_items.stock_id` at it.
- `transfer_dispatch` (0009, unchanged): marks that same stock row `'transferred'` — `branch_id` stays the origin branch; dispatch never moves the row.
- So throughout `in_transit`, a line's `stock_id` always points at a row physically "at" `from_branch_id`, `status = 'transferred'`, `quantity = line.quantity`. The new `transfer_receive_line` is what finally relocates it, and that's where the split math below applies.

## 3. Build and fix loop

```powershell
npm run build
```

Watch particularly for:
- `src/app/(app)/transfers/actions.ts`'s `receiveLine` now sends `p_received_quantity` instead of `p_confirm` — matches the new RPC signature exactly.
- `src/lib/validators/transfer.ts`'s `receiveLineSchema` dropped the `confirm` boolean field and `booleanFromFormString` helper entirely (no longer used anywhere in this file) in favor of `received_quantity` via a `nonNegativeQuantity` preprocessor (mirrors `positiveQuantity` in the same file / `request.ts`'s numeric-coercion pattern — handles both a JSON number and a form string).
- `src/components/transfers/receive-panel.tsx` was rewritten: each unresolved line renders `ReceiveLineForm` — a serialized line (`quantity === 1` and `serial_snapshot` present) gets a Received/Not received toggle (posts `received_quantity` 1 or 0); every other line gets a number input (default = expected qty, `min=0`/`max=expected`) plus a note field that becomes `required` and gets a destructive border the moment the entered quantity differs from expected. Already-resolved lines show `Received X of Y` and a red "Discrepancy" badge when `X < Y`.
- `src/components/transfers/line-editor.tsx`'s `TransferLinesTable` (the read-only view once a transfer is no longer `draft`/`in_transit`) now shows `X of Y` instead of a plain Yes/No, with the same discrepancy badge.
- `src/app/(app)/transfers/[id]/page.tsx` fetches the new `received_quantity` column, threads it through `TransferLineRowData`, and shows a header-level "Discrepancy" badge (next to the status badge) when any line is short.
- `src/app/(app)/transfers/page.tsx` (the `/transfers` list) runs one extra targeted query — `transfer_line_items` filtered to the current page's transfer ids with `received_quantity` not null — to build a `Set` of transfer ids with at least one short line, then passes `has_discrepancy` into `TransferTable`. This is a second query rather than a nested embed, consistent with this codebase's "Map joins not embeds" convention.

## 4. Manual checklist — Item A (SIS vs courier)

- Open a `reserved` transfer as admin/from-branch user, click **Dispatch**. Confirm three separate labeled fields, in this order: "SIS number (internal)" (optional), "Courier" (required — blank submit is blocked by the browser), "Courier tracking / waybill no." (optional).
- Fill all three distinctly (e.g. SIS `SIS-001`, Courier `LBC`, Tracking `WB-99887`) and submit → transfer flips to **In transit**.
- On the transfer detail page's Details card, confirm SIS number, Courier, and Courier tracking / waybill no. each show on their own labeled line with the exact values entered (not concatenated).

## 5. Manual checklist — Item B (partial/discrepant receiving)

Seed data needed: an `in_transit` transfer with (a) one lot line for quantity 300 of a non-serialized product, and (b) one serialized line.

- **Short lot receipt:** as the to-branch user (or admin), open the Receive panel. On the 300-qty line, change the received-quantity box to 200 → the note field immediately gets a red border and becomes required. Try submitting with no note → browser blocks it (or, if bypassed, the RPC raises "discrepancy note required"). Fill a note (e.g. "2 boxes damaged in transit") and click **Confirm receipt** → row now reads "Received 200 of 300" with a red "Discrepancy" badge and the note text.
  - In the SQL editor: confirm the original stock row for that line is now `branch_id = to_branch`, `status = 'available'`, `quantity = 200`. Confirm a **second** stock row now exists at `branch_id = from_branch` (origin), `status = 'available'`, `quantity = 100`, with the same `product_id`/`cost_per_unit`/`supplier_invoice_no` as the original. Confirm `stock_movements` has a `transfer_in` row for 200 (origin→destination) and a second `transfer_in` row for 100 with `from_branch_id`/`to_branch_id` reversed (destination→origin) and a note starting "shortfall returned to origin:". Add the two movement quantities (200 + 100) — they must equal the original line quantity (300); no units created or destroyed.
- **Serialized line, Not received:** on the serialized line, click **Not received** (no number box — a 1/0 toggle) → note required (e.g. "unit missing from box"), submit. Confirm the row reads "Received 0 of 1" with the Discrepancy badge, and in the SQL editor the stock row is back at the origin branch, `status = 'available'` (not `'available'` at destination) — no split row is created for a serialized line.
- **Full receipt:** on a third, unmodified line, leave the received-quantity box at its default (= expected qty), leave the note blank, click **Confirm receipt** → resolves immediately with no discrepancy badge, no note required. Confirm the stock row moved entirely to the destination branch as `available` and exactly one `transfer_in` movement was recorded for the full quantity.
- Once every line on the transfer is resolved (confirmed with any quantity, including 0), the transfer should flip to **Confirmed** automatically — same completion rule as before, just simplified since every line is now `received_confirmed = true` once processed (open/closed is no longer split across a separate "noted but not confirmed" state).
- **Discrepancy badges roll up:** back on `/transfers`, the list row for this transfer shows a red "Discrepancy" badge next to its status. On the transfer detail page, the header also shows the badge next to the status badge.

## 6. Known gaps / things to double check locally

- No generated `Database` type exists in this repo — same caveat as every prior phase; the `transfer_receive_line` RPC call in `actions.ts` is loosely typed and a param-name typo would only surface at runtime.
- `received_quantity` is nullable (lines not yet received have `null`, not `0`) — this is intentional, distinguishing "not yet processed" from "confirmed receipt of zero units"; every discrepancy check in the UI/RPC guards on `received_confirmed` being true before comparing `received_quantity < quantity`, so an unprocessed line never falsely reads as a discrepancy.
- The new split-stock row created for a shortfall at the origin does not carry forward `legacy_id` (there isn't one to copy) or `return_date` (this isn't a sales return) — it's a fresh row exactly like a lot split at `transfer_reserve` time, just running in reverse.
- `transfer_receive_line`'s existing "not found" gap on `v_transfer` (no explicit `if not found` check right after selecting it, relying on the foreign key for practical safety) was preserved as-is from the original 0009 definition per the "copy faithfully" instruction — not a new issue introduced this session.

---

# Phase 6c Runbook — Item C (hearing-test review workflow)

Built entirely with Read/Write/Edit tools this session (bash tool unusable per environment constraint, Glob avoided for `(app)` paths). **None of this has been compiled or run.** Treat the first `npm run build` as the real first build. Migration used: `0028_hearing_test_review.sql`.

## 1. Push migration 0028

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0028_hearing_test_review.sql` applies cleanly. It adds five columns to `visits` — `is_hearing_test boolean not null default false`, `reviewed_at timestamptz`, `reviewed_by uuid references profiles(id)`, `review_notes text`, `resulted_in_sale_id uuid references sales(id)` — and one new RLS policy, `visits_review_write` (`for update`, `using`/`with check` both `auth_role() in ('admin','top_mgmt')`). Verify in the dashboard: Table Editor → `visits` has the five new columns; Authentication → Policies → `visits` shows `visits_review_write` alongside the existing `visits_read`/`visits_write` from 0012.

**Exact RLS change, spelled out:** 0012's `visits_write` already grants `for all` (insert/update/delete) to `admin`, `branch_rep`, and `top_mgmt` with no branch scoping at all (`visits` carries no `branch_id` column to scope against — that's pre-existing, not something this session touched). That means, at the raw Postgres level, `branch_rep` already had the technical ability to write the new `review_*` columns on any visit before this migration, and still does after it — this migration does not attempt to claw that back (would need a column-aware trigger, out of scope). What 0028 adds is a **second, additive** policy, `visits_review_write`, granting `top_mgmt`/`admin` an explicit UPDATE independent of `visits_write`. Practical enforcement that a `branch_rep` cannot use the review workflow comes from the server action role guard in `src/app/(app)/hearing-tests/actions.ts` (`requireReviewerProfile()`, checked at the top of both `reviewHearingTest` and `linkVisitSale`) — belt-and-braces, same pattern already used for the `admin_corrections` RPCs. Branch create/edit of visits (0012's `visits_write`) is completely untouched.

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- No generated `Database` type exists in this repo (same caveat as every prior phase) — every new `.from("visits")` column reference (`is_hearing_test`, `reviewed_at`, `reviewed_by`, `review_notes`, `resulted_in_sale_id`) and the two new server actions' `.update(...)` calls are loosely typed; a typo'd column name only surfaces at runtime.
- `src/app/(app)/hearing-tests/actions.ts`'s `requireReviewerProfile()` returns a discriminated union (`{ profile: Profile; denied?: undefined } | { profile?: undefined; denied: HearingTestActionState }`) and is deliberately **not destructured** at the call sites (`const guard = ...; if (guard.denied) return guard.denied; const profile = guard.profile;`) — destructuring both fields up front would have widened `profile` back to `Profile | undefined` after the guard check, since TS discriminated-union narrowing doesn't survive destructuring into separate bindings. If this pattern gets refactored, keep that in mind.
- `src/components/customers/visit-list.tsx` had `VISIT_FILES_BUCKET`, `SIGNED_URL_TTL_SECONDS`, `resolveAttachmentLinks`, and a new `AttachmentLink` type promoted from private to `export` — `src/app/(app)/hearing-tests/page.tsx` imports `resolveAttachmentLinks` directly rather than duplicating the signed-URL logic, per the "same helper as visit-list" instruction. `VisitList`'s own rendering behavior (customer detail page) is unchanged aside from the new hearing-test/reviewed badges.
- `src/app/(app)/hearing-tests/page.tsx` resolves branch filtering as a two-step lookup (customers matching `branch_created_id`, then `visits.customer_id in (...)`) rather than a single query, since `visits` has no `branch_id` of its own — a patient's "branch" for this feature is their customer record's `branch_created_id`. Follows the existing "Map joins not embeds" convention with several small lookups (customers, profiles for reviewer names, sales for OR numbers, and a per-customer sales list for the in-dialog linker) rather than nested `.select()` embeds.

## 3. What was built (Item C)

- **Visit form** (`src/components/customers/visit-form.tsx`): new "This is a hearing test" checkbox (`is_hearing_test`, alongside the existing "Purchase made during this visit" checkbox and the existing file-attachment input — no changes to upload mechanics). Persisted via `logVisitSchema` (`src/lib/validators/customer.ts`) and `logVisit` (`src/app/(app)/customers/actions.ts`).
- **Review actions** (`src/app/(app)/hearing-tests/actions.ts`, types in `src/lib/validators/hearing-test.ts`):
  - `reviewHearingTest(prev, formData)` — top_mgmt/admin only, sets `reviewed_at = now()`, `reviewed_by = <current user>`, `review_notes = <textarea>` on the visit (scoped with `.eq("is_hearing_test", true)` as a defensive guard).
  - `linkVisitSale(prev, formData)` — top_mgmt/admin only, looks up the visit's `customer_id`, and if a `sale_id` is supplied, verifies that sale's `customer_id` matches before writing `resulted_in_sale_id` (an empty selection unlinks by writing `null` — a small bonus beyond the spec, not a hard requirement).
- **New page** `src/app/(app)/hearing-tests/page.tsx` (+ `loading.tsx`): role-gated (`top_mgmt`/`admin`, else `redirect("/")`), cross-branch, 50/page, filters via `?branch=&from=&to=&reviewed=&sale=` (query parsing in `src/app/(app)/hearing-tests/query.ts`). Table columns: patient, branch, visit date, purchased-during-visit badge, linked sale (OR no.) or —, reviewed status (badge + reviewer name + date, or "Unreviewed").
- **Review UI: dialog, not inline-expand.** `src/components/hearing-tests/hearing-tests-table.tsx` — each row has a "Review" button opening a `Dialog` with the test-file link(s) (signed URLs, 3600s TTL, via the promoted `resolveAttachmentLinks` helper), a review-notes textarea + "Mark reviewed" button, and a sale-linker `Select` (populated from that customer's sales, fetched in bulk on the page rather than per-row) + "Save sale link" button. Chose a dialog over an expandable row because the review payload (file links + notes + a full sale picker) is bulkier than the corrections-log's before/after JSON that justified an inline expand there.
- **Nav** (`src/components/nav.tsx`): new "Clinical" section (placed between Customers and Transfers) with a single "Hearing tests" link, roles `admin`/`top_mgmt`.
- **Customer detail visit list** (`src/components/customers/visit-list.tsx`): hearing-test visits now show a "Hearing test" badge plus "Reviewed \<date\>" (success) or "Awaiting review" (warning) next to it. `VisitRowData`'s new fields (`is_hearing_test?`, `reviewed_at?`) are optional so this doesn't break any other caller of `VisitList`.

## 4. Manual checklist

- **Branch logs a hearing-test visit:** as `branch_rep`, open a customer, log a visit with a visit date, tick "This is a hearing test," attach a file (image or PDF), leave "Purchase made during this visit" unticked, submit. Confirm the new visit appears in the customer's visit history with a "Hearing test" badge and an "Awaiting review" badge (no "Purchase made" badge). Try again with "Purchase made during this visit" ticked too — confirm both badges plus "Purchase made" appear.
- **top_mgmt reviews:** log in as `top_mgmt` (or `admin`). Sidebar shows "Hearing tests" under a new "Clinical" section. Open `/hearing-tests` — the visit just logged appears (may need to widen the default From/To date filters — they default to the last 3 months) with the branch name, visit date, "—" for purchased (or the badge if ticked), "—" for linked sale, and an "Unreviewed" badge.
- **Filter unreviewed:** set the Reviewed filter to "Unreviewed," click Apply — confirm only unreviewed rows remain and the URL carries `?reviewed=unreviewed`. Do the same for Branch and Sale filters, and a From/To date range that excludes the visit — confirm it disappears, then widen the range back.
- **Open and review:** click "Review" on the row — dialog opens showing the uploaded file as a clickable link (opens the actual file in a new tab via a signed URL), a review-notes textarea, and a sale-linker. Type a note, click "Mark reviewed" — toast confirms, dialog stays open, row now shows a "Reviewed" badge with your name and today's date once you close/refresh.
- **Link the sale:** if this customer has any recorded sales, the same dialog's "Link to sale" dropdown lists them (date + OR no.); pick one, click "Save sale link" — toast confirms, the table row now shows "OR \<number\>" (or "OR —" if that sale has no OR no.) in the Linked sale column. If the customer has zero sales, the dialog shows "This customer has no recorded sales yet." instead of the dropdown.
- **branch_rep has no Hearing tests link and is redirected:** log in as `branch_rep` (or `technical`). No "Clinical" section / "Hearing tests" link in the sidebar. Navigating directly to `/hearing-tests` redirects to `/`.
- **branch_rep cannot write review fields (RLS):** with a `branch_rep` session, open devtools and call `supabase.from('visits').update({ reviewed_at: new Date().toISOString(), reviewed_by: '<own id>' }).eq('id', '<any visit id>')` directly. This is expected to **succeed** at the RLS layer (0012's pre-existing `visits_write` already permits it — a known, documented pre-existing gap, not introduced by this change) — the real, verified gate is that `branch_rep` cannot reach this codepath through the app at all (no link, redirected page) and the two server actions (`reviewHearingTest`, `linkVisitSale`) both reject a non-top_mgmt/non-admin caller with "Not authorized." before ever issuing the update, even if someone crafts a direct form POST to them. Confirm this explicitly: call `reviewHearingTest`/`linkVisitSale` — via the app there's no way to reach them as `branch_rep` (no UI renders them), so this is really a code-read check of `requireReviewerProfile()` in `src/app/(app)/hearing-tests/actions.ts` rather than something clickable.
- **admin path:** repeat the "top_mgmt reviews" and "link the sale" checks logged in as `admin` — same access, same result.

## 5. Known gaps / things to double check locally

- No generated `Database` type exists in this repo — same caveat as every prior phase.
- As detailed in the RLS section above, `visits_write` (0012) already lets `branch_rep` write any column on any visit at the Postgres level, including the new `review_*` columns — this is a pre-existing gap in the schema (visits have no `branch_id` to scope RLS against at all), not something introduced or fixed by this session. Locking it down properly would need a `before update` trigger comparing `OLD`/`NEW` on the review columns and checking `auth_role()`, which was judged out of scope for this feature (the plan's own "simplest safe approach" explicitly accepted this and relies on the action-level guard instead).
- `resulted_in_sale_id` linking supports unlinking (picking "No sale linked" writes `null`) — this is a small addition beyond the plan's literal ask, kept because it was nearly free once the linking form existed and avoids a one-way-only relationship being awkward to fix from a mis-click.
- The hearing-tests page resolves signed URLs sequentially per visit per attachment path (same pattern as `visit-list.tsx`'s `resolveAttachmentLinks`) — fine at the current data volume; if a single page of 50 hearing-test visits each carries several large attachments, this could add noticeable page-load latency. Worth revisiting (e.g., batching or lazy-loading per-dialog-open) if that becomes a real pattern.
- The "purchased during visit" boolean and the new `resulted_in_sale_id` FK are intentionally two independent signals (per the plan) — a visit can have `purchased_during_visit = true` with no linked sale (reviewer hasn't gotten to it yet) or a linked sale with the boolean left unticked (branch forgot to check it) — the UI doesn't attempt to reconcile or auto-sync these two fields.

# Discount templates — PH Senior Citizen / PWD VAT-exempt discounts (2026-08-11)

Built with Read/Write/Edit/Grep only (bash unavailable, Glob avoided for `(app)` paths). **Not compiled or run locally.** Migration used: `0047_discount_templates.sql`.

## 1. Push migration 0047

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0047_discount_templates.sql` applies cleanly. It adds `sales.discount_type text` (check-constrained to `none | senior_citizen | pwd | custom_percent | custom_amount`, plain text — not an enum — so future templates don't need a migration) and `sales.discount_id_no text`, then drops and recreates `sale_record(...)` with two new trailing params: `p_discount_type text default 'none'`, `p_discount_id_no text default null`. Verify in the dashboard: Table Editor → `sales` has the two new columns; Database → Functions → `sale_record` shows the extended 13-arg signature (old 11-arg one gone, since PostgREST can't disambiguate overloads).

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- No generated `Database` type exists in this repo — every new `.from("sales")` column reference (`discount_type`, `discount_id_no`) and the `.rpc("sale_record", ...)` call are loosely typed; a typo'd param name only surfaces at runtime (Supabase would report "function not found" since PostgREST matches by full signature).
- `src/lib/validators/sale.ts`'s `recordSaleSchema` dropped the old bare `discount`/`vat_amount` form fields entirely, replaced by `discount_type` (enum, defaults `"none"`), `discount_id_no`, `discount_percent` (0-100), `discount_amount` — all validated together in one `.superRefine()` (ID required for SC/PWD, percent required for custom_percent, amount required for custom_amount).
- `src/app/(app)/sales/actions.ts`'s `recordSale` no longer trusts any client-submitted discount/VAT total — it recomputes both from `data.lines` (gross) and the template selection via the new `computeDiscountAndVat()` helper (formulas commented in place), then sends the computed numbers as `p_discount`/`p_vat_amount` to the RPC alongside `p_discount_type`/`p_discount_id_no`. The RPC re-validates the SC/PWD ID-required + VAT-must-be-zero rule as a second layer of defense.
- `src/components/sales/sale-form.tsx` mirrors the same math client-side purely for live display (gross/discount/VAT/net recompute on every keystroke) — the mirrored formulas must stay in sync with `actions.ts` if either changes. The Template `Select` is controlled (for the live conditional UI) with a separate `<input type="hidden" name="discount_type">` doing the actual form submission, since a controlled Radix `Select` with both `name` and `value` set was avoided for clarity.

## 3. What was built

- **Math (all templates), prices are VAT-inclusive 12%:**
  - `none` — discount = 0; VAT = gross × 12/112.
  - `senior_citizen` / `pwd` (RA 9994 / RA 10754) — `vat_exempt_base = gross / 1.12`; `discount = vat_exempt_base × 0.20`; `net payable = vat_exempt_base − discount`; VAT **recorded** = 0 (sale is legally VAT-exempt — the VAT removed, `gross − vat_exempt_base`, is shown separately as "Less: VAT (exempt)," never folded into the discount figure). Requires an SC/PWD ID number (BIR record-keeping).
  - `custom_percent` — discount = gross × pct/100 (pct 0-100); VAT = (gross − discount) × 12/112.
  - `custom_amount` — discount = min(typed amount, gross); VAT = (gross − discount) × 12/112.
  - Every amount rounds to 2dp both client-side (display) and server-side (values sent to the RPC).
- **Verification example (from the spec):** ₱1,120.00 gross, Senior Citizen → `vat_exempt_base = 1120 / 1.12 = 1000.00` → discount = `1000.00 × 0.20 = 200.00` → net payable = `1000.00 − 200.00 = 800.00` → VAT recorded = `0.00`. Matches `computeDiscountAndVat` in `actions.ts` and the mirrored client formula in `sale-form.tsx` exactly.
- **Sale form** (`src/components/sales/sale-form.tsx`): the old bare "Discount" + manual "VAT (12/112)" override inputs are gone, replaced by a "Discount" template `Select` (None / Senior Citizen (20%) / PWD (20%) / Custom % / Custom amount). Senior Citizen/PWD shows a required ID-number input plus a breakdown box: Gross (VAT-inc) → Less: VAT (exempt) → VAT-exempt sale → Less: 20% discount → **Net payable** → VAT recorded (always ₱0.00). Custom % shows a 0-100 percent input; Custom amount shows an amount input (with a "will be clamped" warning if it exceeds gross); both (and None) show a simple totals block: Gross, Discount, Net, VAT (12/112, informational), Net of VAT. Everything recomputes live off the existing line-item state.
- **Server action** (`src/app/(app)/sales/actions.ts`): new `computeDiscountAndVat()` — pure function, gross total in, `{discount, vatAmount}` out, switch over the five templates per the formulas above. `recordSale` now sums `data.lines` for gross, calls this helper, and passes the computed values (never the client's) to `sale_record` along with `p_discount_type`/`p_discount_id_no`.
- **Sale detail page** (`src/app/(app)/sales/[id]/page.tsx`): Details card gains "Discount type" (label) and, for SC/PWD, the ID number field. The Lines card's totals block branches the same way as the form: SC/PWD sales get the full VAT-exempt breakdown (VAT-exempt amount and net payable are re-derived from `gross`/`discount` on the fly since the VAT removed was never stored — `vat_amount` is 0 by design); everything else keeps the original Gross/Discount/Net/VAT/Net-of-VAT block.
- **CSV export** (`src/app/(app)/sales/export/route.ts`): "Discount type" and "Discount ID no." columns added immediately after "Discount" (same per-sale-first-line-only convention as the existing Discount column, so summing Line total doesn't double count).
- **Not touched (deliberately):** `sales_totals` view (0014) and the reports/analytics `net_sales`/`net_of_vat` formulas still compute `gross − discount` (and `− vat_amount`) generically — for SC/PWD this does **not** equal the true net payable, because the VAT removed (₱120 in the ₱1,120 example) is real money off the price but is neither part of the stored `discount` nor the stored `vat_amount` (which is 0 by design, to mean "exempt," not "no VAT was ever embedded in the price"). The sale form and sale detail page both re-derive and display the true net payable via `vat_exempt_base`; the generic reporting views were out of scope for this task and were left untouched.

## 4. Manual checklist

- **Senior Citizen sale:** record a sale with one line at ₱1,120.00 (e.g. quantity 1 × unit price 1,120). Select Discount = "Senior Citizen (20%)" — an ID number field appears; try submitting with it blank (expect a validation error, both client-side "Required" style and, if bypassed, the server's "ID number is required..." message). Fill in an ID, confirm the breakdown box shows Gross ₱1,120.00 → Less: VAT (exempt) −₱120.00 → VAT-exempt sale ₱1,000.00 → Less: 20% discount −₱200.00 → **Net payable ₱800.00** → VAT recorded ₱0.00. Submit — on the detail page, confirm Discount = ₱200.00, Discount type = "Senior Citizen (20%)", the ID number shows, VAT recorded = ₱0.00, and the same breakdown block appears with Net payable ₱800.00.
- **PWD sale:** repeat with Discount = "PWD (20%)" — same math, label reads "PWD ID no.".
- **Custom % sale:** Discount = "Custom %", enter 10 — confirm Discount = 10% of gross, VAT recomputes off the discounted amount (informational), Net = gross − discount. Submit and confirm the detail page's plain (non-SC/PWD) totals block matches.
- **Custom amount sale:** Discount = "Custom amount", type an amount larger than gross — confirm the "will be clamped" warning appears and the recorded discount clamps to gross (net = ₱0.00) after submit.
- **None (unchanged behavior):** Discount = "None" (the default) — confirm no discount fields appear, VAT auto-computes at 12/112 of gross exactly like before this change, and the detail page shows Discount ₱0.00, Discount type "None".
- **CSV export:** from `/sales`, export CSV — confirm "Discount type" and "Discount ID no." columns appear right after "Discount", populated only on each sale's first exported line (blank on subsequent lines of a multi-line sale), and that a Senior Citizen sale's row shows "senior_citizen" + the ID number typed above.

# Sale money modes — SRP-locked lines, final-price entry, explicit VAT-exempt (2026-08-13)

Built with Read/Write/Edit/Grep only (bash unavailable, Glob avoided for `(app)` paths). **Not compiled or run locally.** Migration used: `0049_sale_money_modes.sql` (0048 already existed — `intake_perf` — so this is the next free number).

## 1. Push migration 0049

```powershell
npx supabase db push -p "<db password from .env.local>"
```

Expected: `0049_sale_money_modes.sql` applies cleanly. It adds `sales.vat_exempt boolean not null default false`, extends the `sales_discount_type_check` constraint to include `'final_price'` (drop + re-add, existing rows unaffected — all five 0047 values stay valid), then drops and recreates `sale_record(...)` with one new trailing param: `p_vat_exempt boolean default false`. SC/PWD sales now also require `p_vat_exempt = true` (raises `'SC/PWD discount sales must be marked VAT-exempt'` otherwise) on top of the existing ID-required + VAT-must-be-zero checks; a general safety net also rejects any sale where `p_vat_exempt = true` but `p_vat_amount <> 0`. Verify in the dashboard: Table Editor → `sales` has the new `vat_exempt` column; Database → Functions → `sale_record` shows the extended 14-arg signature (old 13-arg one from 0047 gone).

## 2. Build

```powershell
npm run build
```

Watch particularly for:
- Same loosely-typed-RPC caveat as 0047 — no generated `Database` type exists, so `p_vat_exempt` and the new `vat_exempt`/`final_price` column/field references only fail at runtime if misspelled.
- `src/lib/validators/sale.ts`'s `DISCOUNT_TYPES` was **reordered** (client-requested Select order: none / final_price / custom_amount / custom_percent / senior_citizen / pwd) and gained `'final_price'`. Two new schema fields: `final_price` (nullable number, required via `.superRefine()` when `discount_type === 'final_price'`) and `vat_exempt` (boolean, defaults false from an absent/unchecked form checkbox).
- `src/app/(app)/sales/actions.ts`'s `computeDiscountAndVat()` gained two params (`finalPrice`, `vatExempt`) and now returns `vatExempt` too (SC/PWD forces it true in the return regardless of the input). `recordSale` now: (a) fetches the caller's profile and, for `branch_rep`, re-derives every line's `unit_price` from `products.srp` (stock lines, via the line's `stock_id` → `stock.product_id` → `products.srp`) or `service_pricing` (service lines, by `service_id` + the sale's `branch_id`) — overwriting whatever the client submitted, since the client-side input lock is UI-only; (b) computes `grossTotal` from those (possibly overwritten) lines, not the raw submission; (c) for `final_price` mode, rejects with the exact string `'final price exceeds item total'` if the declared final price exceeds gross (0.005 epsilon for float sums) — server-side, before the RPC is ever called; (d) forces `effectiveVatExempt = true` whenever `discount_type` is `senior_citizen`/`pwd`, otherwise passes through the submitted checkbox value; (e) passes the computed `vatExempt` as `p_vat_exempt` to the RPC.
- `src/components/sales/sale-form.tsx` gained a `role` prop (threaded from `profile.role` in `sales/new/page.tsx`) — the unit-price `Input` on each line is `disabled` when `role === 'branch_rep'` (UI convenience only; the server is the real trust boundary, see above). The breakdown box was unified into one four-row layout regardless of mode (Items total (SRP) → Discount → Final price → VAT), with a "VAT-exempt sale" checkbox rendered between the discount fields and the breakdown — checked+disabled automatically whenever Senior Citizen/PWD is selected (`useEffect` on `isScOrPwd`), otherwise a plain toggle. The VAT row shows the literal text "VAT-exempt" instead of ₱0.00 whenever exempt, so a genuinely-zero-VAT sale and an exempt sale never look identical.

## 3. What was built

- **Math per mode, prices are VAT-inclusive 12%. VAT is never hand-typed** — it's always derived (`final × 12/112`, or 0 when exempt):
  - `none` — discount = 0; final = gross.
  - `final_price` (**new**) — final = the rep's typed receipt amount (server rejects final > gross before it ever reaches the RPC); discount = gross − final, clamped ≥ 0.
  - `senior_citizen` / `pwd` — **unchanged from 0047**: `vat_exempt_base = gross / 1.12`; discount = `vat_exempt_base × 0.20`; net payable = `vat_exempt_base − discount`; always VAT-exempt (now also sets the explicit `vat_exempt` column, not just `vat_amount = 0`); requires an SC/PWD ID number.
  - `custom_percent` — discount = gross × pct/100; final = gross − discount.
  - `custom_amount` — discount = min(typed amount, gross); final = gross − discount.
  - Every amount rounds to 2dp both client-side (display) and server-side (values sent to the RPC).
- **Why `vat_exempt` is its own column:** previously VAT-exempt could only be inferred from `vat_amount = 0`, which is ambiguous — a real (tiny, VAT-inclusive) sale can also round to ₱0.00 VAT. The new boolean makes "this sale is legally VAT-exempt" an explicit, queryable fact instead of an inference.
- **Line prices = SRP, locked for branch_rep:** `sale-form.tsx` already pre-filled `unit_price` from the `srp`/`service_pricing` maps the page passes in (`sales/new/page.tsx` — unchanged, this data flow existed before); the change is that branch_rep can no longer edit it (disabled input) and, more importantly, the server now re-derives it from the same source tables regardless of what's submitted for that role. Admin keeps full edit rights, client- and server-side.
- **Verification example (client-final spec):** gross ₱2,240.00, rep types final sale price ₱2,000.00 → discount = ₱240.00, VAT = `2000 × 12/112 = 214.29`. Same sale with "VAT-exempt sale" checked → VAT = ₱0.00 (discount unchanged at ₱240.00, final unchanged at ₱2,000.00).
- **Sale form** (`src/components/sales/sale-form.tsx`): Discount `Select` labels now read "No discount / Final sale price / Discount amount / Discount % / Senior Citizen 20% / PWD 20%" (renamed + reordered from 0047's "None / Senior Citizen (20%) / PWD (20%) / Custom % / Custom amount"). "Final sale price (from receipt)" is a single number input shown only in `final_price` mode, with a "Final price exceeds item total" warning (mirrors the server's rejection message) if the typed value is above gross.
- **Server action** (`src/app/(app)/sales/actions.ts`): see the build-loop notes above for the full branch_rep price-lock + final-price rejection + vat_exempt plumbing.
- **Sale detail page** (`src/app/(app)/sales/[id]/page.tsx`): Details card gains a "VAT-exempt" Yes/No row; `DISCOUNT_TYPE_LABELS` updated to the new label set (compile-enforced — `Record<DiscountType, string>` requires every key, including `final_price`); the non-SC/PWD totals block's "Net" row is relabeled "Final price" and its VAT row shows "VAT-exempt" instead of a peso amount when `vat_exempt` is true (or when SC/PWD, as before).
- **CSV export** (`src/app/(app)/sales/export/route.ts`): "VAT-exempt" column added after "Discount ID no." (same per-sale-first-line-only convention — "yes"/"no", blank on subsequent lines of a multi-line sale).
- **Not touched (deliberately):** `sales_totals` view (0014) and reports/analytics — same rationale as 0047's note: those generic views don't know about `vat_exempt` or `final_price` and were out of scope here. Import scripts and `tests/sales-vat.test.ts` call `sale_record` without the new trailing params, which is fine — `p_discount_type`, `p_discount_id_no`, and `p_vat_exempt` all default (`'none'`, `null`, `false`), so existing calls behave exactly as before.

## 4. Manual checklist

- **Branch rep price lock:** log in (or view-as) a branch_rep, start a new sale, add a stock line — confirm the unit-price input is greyed out/disabled and pre-filled from SRP. Try editing it via devtools (change the disabled attribute) and submit anyway — confirm the recorded sale's line price on the detail page still matches the product's SRP, not the tampered value (proves the server-side recompute, not just the UI lock).
- **Admin price edit (regression):** as admin, confirm the unit-price input is still editable and a changed price is honored on submit.
- **Final-price mode math:** add lines totaling ₱2,240.00 gross, select "Final sale price", type ₱2,000.00 — confirm the breakdown reads Items total ₱2,240.00 → Discount −₱240.00 → Final price ₱2,000.00 → VAT ₱214.29. Submit and confirm the detail page matches (Discount ₱240.00, Discount type "Final sale price").
- **Final-price over gross (rejection):** same lines, type a final price above ₱2,240.00 — confirm the inline warning appears client-side, and confirm submission is rejected server-side with "final price exceeds item total" (try bypassing the client validation via devtools if needed to prove the server check, not just the client one).
- **VAT-exempt toggle:** repeat the ₱2,000.00 final-price sale with "VAT-exempt sale" checked — confirm VAT shows "VAT-exempt" (not ₱0.00-as-a-number) in the live breakdown, and on the detail page the VAT row reads "VAT-exempt" and the new "VAT-exempt" detail field reads "Yes".
- **SC/PWD regression:** record a Senior Citizen sale as before (0047's checklist) — confirm the ID-number field, the math, and the breakdown are unchanged, and confirm the "VAT-exempt sale" checkbox is auto-checked and disabled (can't be unchecked) the moment Senior Citizen/PWD is selected.
- **CSV export:** from `/sales`, export CSV — confirm a "VAT-exempt" column appears after "Discount ID no." reading "yes"/"no", populated only on each sale's first exported line, matching what the detail page shows for the same sale.
