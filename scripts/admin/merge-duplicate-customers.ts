// Merge duplicate customer rows that share a normalized name (case-,
// whitespace-, and corporate-suffix-insensitive: "X Company", "X Company Inc"
// and "X Company Inc." group together).
// Scope: groups with >= MIN_GROUP rows — at that size the name is an
// institution or doctor, not two people who happen to share a name.
//
// For each group: keep the row with the most contact info (oldest on ties),
// repoint sales / visits / repair_requests to it, fill the keeper's missing
// contact fields from the duplicates, log everything to customer_merge_log,
// then delete the duplicates. Every merge is reversible from the log.
//
// NOTE: scripts/import/customers.ts skips legacy_ids found in
// customer_merge_log, so re-running the Bubble import no longer resurrects
// merged rows (it did before 2026-08-24 — that is how the 2026-08-06 re-import
// undid the 2026-08-04 merge batch).
import { serviceClient, fetchAll } from '../import/lib';
import { writeFileSync, mkdirSync } from 'node:fs';

const MIN_GROUP = 10;
// DRY_RUN=1 npx tsx ... — list what would merge, change nothing
const DRY_RUN = process.env.DRY_RUN === '1';
// placeholder "names" that aren't a single real entity — never merge these
const SKIP_NAMES = new Set(['cash', 'walk-in', 'walk in', 'n/a', 'na', 'none', 'test']);

const norm = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// corporate suffix tokens stripped (repeatedly) from the end of a name for
// grouping, so punctuation/suffix variants of one institution merge together
const SUFFIXES = new Set(['inc', 'incorporated', 'corp', 'corporation', 'ltd', 'llc']);
const stripSuffixes = (k: string): string => {
  const words = k.split(' ').map(w => w.replace(/[.,]+$/, ''));
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ');
};

// confirmed same-entity names that don't normalize to their group's key
const ALIASES = new Map<string, string>([
  ['autocust:jeismic medical', 'jeismic medical company'],
]);

const groupKey = (name: string | null | undefined): string => {
  const k = stripSuffixes(norm(name));
  return ALIASES.get(k) ?? k;
};

type Customer = {
  id: string; legacy_id: string | null; name: string; mobile_no: string | null;
  email: string | null; address: string | null; date_of_birth: string | null;
  branch_created_id: string | null; created_at: string;
};

const contactScore = (c: Customer) =>
  (c.mobile_no ? 1 : 0) + (c.email ? 1 : 0) + (c.address ? 1 : 0) +
  (c.date_of_birth ? 1 : 0);

async function repoint(
  client: ReturnType<typeof serviceClient>,
  table: string, from: string, to: string,
): Promise<string[]> {
  const { data, error } = await client.from(table)
    .update({ customer_id: to })
    .eq('customer_id', from)
    .select('id');
  if (error) throw new Error(`${table} repoint ${from}: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function main() {
  const client = serviceClient();
  const batch = `merge-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const customers = await fetchAll(client, 'customers',
    'id, legacy_id, name, mobile_no, email, address, date_of_birth, branch_created_id, created_at') as Customer[];

  const byName = new Map<string, Customer[]>();
  for (const c of customers) {
    const k = groupKey(c.name);
    if (!k || SKIP_NAMES.has(k)) continue;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c);
  }
  const groups = [...byName.values()].filter(g => g.length >= MIN_GROUP);
  console.log(`batch ${batch}: ${groups.length} groups, ` +
    `${groups.reduce((a, g) => a + g.length - 1, 0)} rows to merge`);

  if (DRY_RUN) {
    for (const g of groups) {
      const names = [...new Set(g.map(c => c.name))];
      console.log(`  [dry-run] ${g.length} rows: ${names.join(' | ')}`);
    }
    console.log('dry run — nothing changed');
    return;
  }

  const report: string[] = ['kept_id,name,merged_count,sales_repointed,visits_repointed,repairs_repointed'];
  let totalMerged = 0, totalSales = 0, totalVisits = 0, totalRepairs = 0;

  for (const group of groups) {
    const sorted = [...group].sort((a, b) =>
      contactScore(b) - contactScore(a) ||
      a.created_at.localeCompare(b.created_at));
    const keeper = sorted[0];
    const dupes = sorted.slice(1);

    // fill keeper's missing contact fields from the best-scoring duplicate
    const fill: Partial<Customer> = {};
    for (const field of ['mobile_no', 'email', 'address', 'date_of_birth'] as const) {
      if (keeper[field]) continue;
      const donor = dupes.find(d => d[field]);
      if (donor) fill[field] = donor[field]!;
    }
    if (Object.keys(fill).length > 0) {
      const { error } = await client.from('customers').update(fill).eq('id', keeper.id);
      if (error) throw new Error(`keeper fill ${keeper.id}: ${error.message}`);
    }

    let gSales = 0, gVisits = 0, gRepairs = 0;
    for (const dupe of dupes) {
      const sales = await repoint(client, 'sales', dupe.id, keeper.id);
      const visits = await repoint(client, 'visits', dupe.id, keeper.id);
      const repairs = await repoint(client, 'repair_requests', dupe.id, keeper.id);
      gSales += sales.length; gVisits += visits.length; gRepairs += repairs.length;

      const { error: logError } = await client.from('customer_merge_log').insert({
        batch, kept_id: keeper.id, merged_id: dupe.id,
        merged_legacy_id: dupe.legacy_id,
        merged_row: dupe,
        repointed: { sales, visits, repairs },
      });
      if (logError) throw new Error(`log ${dupe.id}: ${logError.message}`);

      const { error: delError } = await client.from('customers')
        .delete().eq('id', dupe.id);
      if (delError) throw new Error(`delete ${dupe.id}: ${delError.message}`);
    }

    totalMerged += dupes.length;
    totalSales += gSales; totalVisits += gVisits; totalRepairs += gRepairs;
    report.push(`${keeper.id},"${keeper.name.replace(/"/g, '""')}",${dupes.length},${gSales},${gVisits},${gRepairs}`);
    console.log(`  "${keeper.name}": merged ${dupes.length} ` +
      `(sales ${gSales}, visits ${gVisits}, repairs ${gRepairs})`);
  }

  mkdirSync('data/import-reports', { recursive: true });
  writeFileSync('data/import-reports/customer-merges.csv', report.join('\n'));
  console.log(`\ndone: merged ${totalMerged} rows into ${groups.length} keepers ` +
    `(repointed ${totalSales} sales, ${totalVisits} visits, ${totalRepairs} repairs)`);
  console.log('log: customer_merge_log, report: data/import-reports/customer-merges.csv');
}
main().catch(e => { console.error(e); process.exit(1); });
