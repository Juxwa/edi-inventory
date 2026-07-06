import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { importBranches } from './branches';
import { importProducts } from './products';
import { importServicePricing } from './service-pricing';
import { importStock } from './stock';
import { importTransfers } from './transfers';
import { serviceClient } from './lib';

const dir = 'data/exports';
const file = (prefix: string) => {
  const match = readdirSync(dir).find((f: string) => f.startsWith(prefix));
  if (!match) throw new Error(`no export file starting with ${prefix}`);
  return `${dir}/${match}`;
};

async function main() {
  await importBranches(file('export_All-Branches'));
  await importProducts(file('export_All-Products'));
  await importServicePricing(file('export_All-Service-Pricings'));
  await importStock(file('export_All-Stocks'));
  await importTransfers(file('export_All-Transfer-Records'));

  const client = serviceClient();
  console.log('\n=== VALIDATION REPORT ===');
  for (const t of ['branches','suppliers','products','services',
                   'service_pricing','stock','transfers']) {
    const { count } = await client.from(t).select('*', { count: 'exact', head: true });
    console.log(`${t}: ${count} rows`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
