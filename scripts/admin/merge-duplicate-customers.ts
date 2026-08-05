// Merge duplicate customer rows that share an exact (normalized) name.
// Scope: groups with >= MIN_GROUP rows — at that size the name is an
// institution or doctor, not two people who happen to share a name.
//
// For each group: keep the row with the most contact info (oldest on ties),
// repoint sales / visits / repair_requests to it, fill the keeper's missing
// contact fields from the duplicates, log everything to customer_merge_log,
// then delete the duplicates. Every merge is reversible from the log.
//
// NOTE: merged rows lose their legacy_id — re-running the Bubble customer
// import would resurrect them. Don't re-run scripts/import/customers.ts
// after merging without checking customer_merge_log first.
import { serviceClient, fetchAll } from '../import/lib';
import { writeFileSync, mkdirSync } from 'node:fs';

const MIN_GROUP = 10;
// placeholder "names" that aren't a single real entity — never merge these
const SKIP_NAMES = new Set(['cash', 'walk-in', 'walk in', 'n/a', 'na', 'none', 'test']);

const norm = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

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
    const k = norm(c.name);
    if (!k || SKIP_NAMES.has(k)) continue;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c);
  }
  const groups = [...byName.values()].filter(g => g.length >= MIN_GROUP);
  console.log(`batch ${batch}: ${groups.length} groups, ` +
    `${groups.reduce((a, g) => a + g.length - 1, 0)} rows to merge`);

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
