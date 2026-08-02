import 'dotenv/config';
import { serviceClient } from '../import/lib';

const BUCKET = 'visit-files';
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

type Client = ReturnType<typeof serviceClient>;

// Storage `list()` is folder-scoped: a "folder" entry has no `id`. Paths here
// are `${customer_id}/${visit_id}/${filename}` (see
// src/app/(app)/customers/actions.ts), so this recurses two levels deep, but
// makes no assumption about depth beyond that.
async function listAllPaths(client: Client, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await client.storage.from(BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        paths.push(...await listAllPaths(client, path));
      } else {
        paths.push(path);
      }
    }
    if (data.length < LIST_PAGE_SIZE) break;
  }
  return paths;
}

async function removeAll(client: Client, paths: string[]) {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await client.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove batch ${i}: ${error.message}`);
    console.log(`deleted ${Math.min(i + REMOVE_BATCH_SIZE, paths.length)}/${paths.length}`);
  }
}

async function main() {
  const confirmed = process.argv.includes('--yes');
  const client = serviceClient();
  const paths = await listAllPaths(client, '');

  if (!confirmed) {
    console.log(`DRY RUN: found ${paths.length} object(s) in bucket "${BUCKET}".`);
    if (paths.length > 0) {
      console.log('First 20:');
      paths.slice(0, 20).forEach((p) => console.log(`  ${p}`));
    }
    console.log('\nRe-run with --yes to delete them. The bucket and its policies are never touched.');
    return;
  }

  if (paths.length === 0) {
    console.log(`bucket "${BUCKET}" is already empty.`);
    return;
  }

  await removeAll(client, paths);
  console.log(`done: deleted ${paths.length} object(s) from "${BUCKET}".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
