# Wipe + Reimport runbook

Full data wipe and reload from fresh Bubble exports. Follow in order — steps
are not independently safe to skip or reorder.

## 1. Preconditions

- [ ] Supabase backup/snapshot taken and confirmed (Dashboard → Database →
      Backups, or a local `supabase db dump`).
- [ ] Decided: **Option A** (wipe users too, recreate via bulk-users — keeps
      RLS consistent, everyone gets a fresh login) or **Option B** (keep
      `branches` + existing logins, everything else wiped). See
      `scripts/admin/wipe-db.sql` for the rationale.
- [ ] Fresh Bubble CSV exports ready locally.
- [ ] Option A only: `data/users.csv` ready for `scripts/admin/bulk-users.ts`.

## 2. Push schema

```
npx supabase db push
```

Confirms migrations 0029-0031 (activity log + triggers, must_change_password,
visit links) are applied before import, so new columns/triggers exist when
data lands.

## 3. Clear `data/exports`

Empty the directory completely before copying in new files.

> **Duplicate-file trap**: file discovery in `scripts/import/run.ts` does a
> prefix match and the *first* match wins if two files share a prefix. Two
> `export_All-Service-Pricings...` files currently coexist in this repo and
> the older one silently wins. If you don't empty the directory first, a
> stale file can shadow the new export with no error.

Also empty `data/import-reports/` (9 stale exception CSVs from the last run)
so this run's reports aren't confused with the old ones.

## 4. Copy fresh CSVs into `data/exports`

Expected filename prefixes (import does a `startsWith` match, so exact
suffixes/timestamps don't matter):

Mandatory (import throws if missing):
- `export_All-Branches`
- `export_All-Products`
- `export_All-Service-Pricings`
- `export_All-Stocks`
- `export_All-Transfer-Records`

Optional (import logs a skip if missing, does not fail):
- `export_All-Customers`
- `export_All-Sales`
- `export_All-Repair-Requests`
- `export_All-Earmold-Requests`

## 5. Run `wipe-db.sql`

In the Supabase SQL editor:
- Run **Section 1** (the truncate) — always.
- Option A: also run **Section 2** (`delete from auth.users;`).
- Option B: instead, use the alternate truncate list given in the comments
  (drop `branches` from Section 1's list) — do not run Section 2.

## 6. Clear visit attachments

```
npm run clear-visit-files -- --yes
```

Storage isn't covered by the SQL truncate (no FK cascade from Postgres into
Storage). Without `--yes` it only prints what it would delete. This never
touches the `visit-files` bucket itself or its 2 policies.

## 7. Run the import

```
npm run import
```

Must be run with CWD = `app/`. Afterward:
- Review `data/import-reports/*-exceptions.csv` for rows the import skipped
  (bad refs, blank required fields, negative quantities, etc.).
- Review the `=== VALIDATION REPORT ===` row counts printed at the end
  against the expected counts for this export.

## 8. Empty-sale-headers cleanup

Legacy sale headers with no line items (an artifact of the Bubble export)
should be removed after every reimport:

```sql
delete from sales
where legacy_id like 'sale:%'
  and not exists (
    select 1 from sale_line_items
    where sale_line_items.sale_id = sales.id
  );
```

## 9. Option A only: recreate accounts

```
npm run bulk-users
```

Reads `data/users.csv`, creates auth users + profiles with default password
`edi2026` (forced change on first login). Smoke-test one login end to end
before considering this step done.

## 10. Smoke checks

- [ ] Log in (existing login for Option B, or a freshly bulk-created one for
      Option A — confirm the forced password-change flow fires).
- [ ] Stock list loads and filters work.
- [ ] Sales history shows imported sales.
- [ ] A customer's visit history loads (and, if applicable, that visit file
      attachments are gone / re-uploadable since storage was cleared).
- [ ] `/admin/activity` is empty or near-empty (no backlog of activity-log
      rows from the import — the service-role trigger skip should have kept
      import writes out of it; a non-trivial count here means that's not
      working as expected).
