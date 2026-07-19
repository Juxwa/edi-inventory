import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { importBranches } from './branches';
import { importProducts } from './products';
import { importServicePricing } from './service-pricing';
import { importStock } from './stock';
import { importTransfers } from './transfers';
import { importCustomers } from './customers';
import { importSales } from './sales';
import { importRepairs } from './repairs';
import { importEarmolds } from './earmolds';
import { serviceClient } from './lib';

const dir = 'data/exports';
const file = (prefix: string) => {
  const match = readdirSync(dir).find((f: string) => f.startsWith(prefix));
  if (!match) throw new Error(`no export file starting with ${prefix}`);
  return `${dir}/${match}`;
};

// Some exports are optional (Josh may re-run with subsets); log a skip instead of throwing.
async function optional(label: string, prefix: string, run: (file: string) => Promise<void>) {
  let path: string;
  try {
    path = file(prefix);
  } catch {
    console.warn(`skip ${label}: no export file starting with ${prefix}`);
    return;
  }
  await run(path);
}

async function main() {
  await importBranches(file('export_All-Branches'));
  await importProducts(file('export_All-Products'));
  await importServicePricing(file('export_All-Service-Pricings'));
  await importStock(file('export_All-Stocks'));
  await importTransfers(file('export_All-Transfer-Records'));
  await optional('customers', 'export_All-Customers', importCustomers);
  await optional('sales', 'export_All-Sales', importSales);
  await optional('repairs', 'export_All-Repair-Requests', importRepairs);
  await optional('earmolds', 'export_All-Earmold-Requests', importEarmolds);

  const client = serviceClient();
  console.log('\n=== VALIDATION REPORT ===');
  for (const t of ['branches','suppliers','products','services',
                   'service_pricing','stock','transfers','customers',
                   'sales','sale_line_items','repair_requests',
                   'repair_status_events','earmold_requests']) {
    const { count } = await client.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${count} rows`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
