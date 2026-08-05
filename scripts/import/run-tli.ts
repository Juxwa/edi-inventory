// Standalone runner: transfer line items only (run.ts re-imports everything).
import { readdirSync } from 'node:fs';
import { importTransferLineItems } from './transfer-line-items';

const dir = 'data/exports';
const file = (prefix: string) => {
  const match = readdirSync(dir).find((f: string) => f.startsWith(prefix));
  if (!match) throw new Error(`no export file starting with ${prefix}`);
  return `${dir}/${match}`;
};

importTransferLineItems(
  file('export_All-Transfer-Line-Items'),
  file('export_All-Transfer-Records'),
).catch(e => { console.error(e); process.exit(1); });
