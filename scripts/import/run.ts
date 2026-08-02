import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { importBranches } from './branches';
import { importProducts } from './products';
import { importServicePricing } from './service-pricing';
import { importServices } from './services';
import { importStock } from './stock';
import { importTransfers } from './transfers';
import { importCustomers } from './customers';
import { importSales } from './sales';
import { importRepairs } from './repairs';
import { importEarmolds } from './earmolds';
import { importInventoryRequests } from './inventory-requests';
import { importVisits } from './visits';
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
  // Runs AFTER service-pricing on purpose: service-pricing stub-creates any
  // service name it references (is_stub: true, no description). This pass
  // then overlays the real names from the authoritative Services export —
  // setting is_stub back to false and filling in description — for every
  // name that's genuinely a real service. Both upsert on the same unique
  // `name` column, so running it the other way around wouldn't duplicate
  // rows, but it WOULD leave real services incorrectly flagged is_stub:true
  // whenever service-pricing.ts ran after this and re-touched the same name.
  await optional('services', 'export_All-Services', importServices);
  await importStock(file('export_All-Stocks'));
  await importTransfers(file('export_All-Transfer-Records'));
  await optional('customers', 'export_All-Customers', importCustomers);
  await optional('sales', 'export_All-Sales', importSales);
  await optional('repairs', 'export_All-Repair-Requests', importRepairs);
  await optional('earmolds', 'export_All-Earmold-Requests', importEarmolds);
  // Only depends on branches (already imported above).
  await optional('inventory-requests', 'export_All-Inventory-Requests', importInventoryRequests);
  // Must run after customers: resolves visits.customer_id via the customers
  // ref map.
  await optional('visits', 'export_All-Visits', importVisits);

  const client = serviceClient();
  console.log('\n=== VALIDATION REPORT ===');
  for (const t of ['branches','suppliers','products','services',
                   'service_pricing','stock','transfers','customers',
                   'sales','sale_line_items','repair_requests',
                   'repair_status_events','earmold_requests',
                   'inventory_requests','request_line_items','visits']) {
    const { count } = await client.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${count} rows`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
