import 'dotenv/config';
import { readCsv, serviceClient, writeExceptions, Exception } from './lib';

// Run manually AFTER the main import (npm run import), once visits.ts has
// written data/import-reports/visit-files-to-migrate.csv. Downloads each
// Bubble-hosted file and re-uploads it into the `visit-files` storage
// bucket under legacy/<visit legacy_id>/<filename>, then appends the new
// storage path onto that visit's attachment_paths array.
//
// Resumable: if the destination object already exists, the download/upload
// is skipped (only the attachment_paths append is (re)applied). Never
// deletes or rewrites the source CSV; failures are logged to
// data/import-reports/visit-files-migrate-exceptions.csv and don't abort
// the run.

const BUCKET = 'visit-files';
const REPORT = 'data/import-reports/visit-files-to-migrate.csv';

type FileRow = { visit_legacy_id: string; url: string; kind: string };
type Client = ReturnType<typeof serviceClient>;

function normalizeUrl(u: string): string {
  return u.startsWith('//') ? `https:${u}` : u;
}

// Mirrors sanitizeFilename in src/app/(app)/customers/actions.ts: keeps
// storage paths predictable and safe (alphanumerics, dot, underscore, hyphen).
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function filenameFromUrl(url: string): string {
  const last = url.split('/').pop() || 'file';
  try {
    return sanitizeFilename(decodeURIComponent(last));
  } catch {
    return sanitizeFilename(last);
  }
}

async function objectExists(client: Client, folder: string, filename: string): Promise<boolean> {
  const { data, error } = await client.storage.from(BUCKET).list(folder);
  if (error) return false;
  return (data ?? []).some((o) => o.name === filename);
}

async function main() {
  const rows = readCsv(REPORT) as FileRow[];
  const client = serviceClient();

  const exceptions: Exception[] = [];
  const newPathsByLegacyId = new Map<string, string[]>();
  let uploaded = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const n = i + 2;
    const row = rows[i];
    const legacyId = (row.visit_legacy_id ?? '').trim();
    const url = normalizeUrl((row.url ?? '').trim());
    if (!legacyId || !url) {
      exceptions.push({ row: n, reason: 'missing visit_legacy_id or url', data: JSON.stringify(row) });
      continue;
    }

    const filename = filenameFromUrl(url);
    const folder = `legacy/${legacyId}`;
    const path = `${folder}/${filename}`;

    try {
      if (await objectExists(client, folder, filename)) {
        skipped += 1;
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
        const { error: uploadError } = await client.storage.from(BUCKET)
          .upload(path, buffer, { contentType, upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        uploaded += 1;
      }
      const arr = newPathsByLegacyId.get(legacyId) ?? [];
      arr.push(path);
      newPathsByLegacyId.set(legacyId, arr);
    } catch (e) {
      exceptions.push({ row: n, reason: (e as Error).message, data: JSON.stringify(row) });
    }
  }

  let updated = 0;
  for (const [legacyId, paths] of newPathsByLegacyId) {
    const { data: visit, error } = await client.from('visits')
      .select('id,attachment_paths').eq('legacy_id', legacyId).maybeSingle();
    if (error || !visit) {
      exceptions.push({ row: 0, reason: `visit not found for legacy_id ${legacyId}: ${error?.message ?? ''}`,
        data: JSON.stringify({ legacyId, paths }) });
      continue;
    }
    const existing: string[] = (visit as { attachment_paths: string[] | null }).attachment_paths ?? [];
    const merged = [...new Set([...existing, ...paths])];
    const { error: updateError } = await client.from('visits')
      .update({ attachment_paths: merged }).eq('id', (visit as { id: string }).id);
    if (updateError) {
      exceptions.push({ row: 0, reason: `attachment_paths update failed: ${updateError.message}`,
        data: JSON.stringify({ legacyId, paths }) });
      continue;
    }
    updated += 1;
  }

  writeExceptions('visit-files-migrate', exceptions);
  console.log(`visit files: ${uploaded} uploaded, ${skipped} already present, `
    + `${updated} visits updated, ${exceptions.length} exceptions`);
}

main().catch((e) => { console.error(e); process.exit(1); });
