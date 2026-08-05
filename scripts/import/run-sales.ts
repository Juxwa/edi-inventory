// Standalone runner: sales only (run.ts re-imports everything).
import { readdirSync } from 'node:fs';
import { importSales } from './sales';

const dir = 'data/exports';
const file = (prefix: string) => {
  const match = readdirSync(dir).find((f: string) => f.startsWith(prefix));
  if (!match) throw new Error(`no export file starting with ${prefix}`);
  return `${dir}/${match}`;
};

importSales(file('export_All-Sales'))
  .catch(e => { console.error(e); process.exit(1); });
