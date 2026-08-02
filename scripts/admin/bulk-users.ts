import 'dotenv/config';
import { readCsv, clean, writeExceptions, serviceClient, Exception } from '../import/lib';

const TEMP_PASSWORD = 'edi2026';
const ROLES = ['admin', 'branch_rep', 'top_mgmt', 'technical'] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = Record<string, string>;

type ParsedRow = {
  email: string;
  name: string;
  role: Role;
  branchCode: string | null;
};

function parseRow(row: Row, n: number): { record: ParsedRow } | { exception: Exception } {
  const email = clean(row['email']);
  const name = clean(row['name']);
  const roleRaw = clean(row['role']);
  const branchCode = clean(row['branch_code']);

  if (!email || !EMAIL_RE.test(email)) {
    return { exception: { row: n, reason: 'missing or invalid email', data: JSON.stringify(row) } };
  }
  if (!name) {
    return { exception: { row: n, reason: 'missing name', data: JSON.stringify(row) } };
  }
  if (!roleRaw || !ROLES.includes(roleRaw as Role)) {
    return { exception: { row: n, reason: `invalid role: ${roleRaw ?? ''}`, data: JSON.stringify(row) } };
  }
  const role = roleRaw as Role;
  if (role === 'branch_rep' && !branchCode) {
    return { exception: { row: n, reason: 'branch_rep requires a branch_code', data: JSON.stringify(row) } };
  }

  return { record: { email, name, role, branchCode } };
}

async function main() {
  const path = process.argv[2] ?? 'data/users.csv';
  const client = serviceClient();
  const rows = readCsv(path);

  const { data: branchRows, error: branchError } = await client.from('branches').select('id,code');
  if (branchError) throw new Error(`branches fetch: ${branchError.message}`);
  const branchByCode = new Map(
    (branchRows as { id: string; code: string }[]).map((b: { id: string; code: string }) => [b.code, b.id]),
  );

  const exceptions: Exception[] = [];
  let created = 0;
  let reused = 0;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const n = i + 2;
    const row = rows[i];
    const parsed = parseRow(row, n);
    if ('exception' in parsed) {
      exceptions.push(parsed.exception);
      continue;
    }
    const { email, name, role, branchCode } = parsed.record;

    let branchId: string | null = null;
    if (branchCode) {
      const id = branchByCode.get(branchCode);
      if (!id) {
        exceptions.push({ row: n, reason: `unknown branch_code: ${branchCode}`, data: JSON.stringify(row) });
        continue;
      }
      branchId = id;
    }

    let userId: string;
    const { data: createData, error: createError } = await client.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
    });
    if (createError || !createData.user) {
      const { data: listData, error: listError } = await client.auth.admin.listUsers();
      const existing = listError
        ? undefined
        : listData.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) {
        exceptions.push({
          row: n,
          reason: `createUser failed: ${createError?.message ?? 'unknown error'}`,
          data: JSON.stringify(row),
        });
        continue;
      }
      userId = existing.id;
      reused += 1;
    } else {
      userId = createData.user.id;
      created += 1;
    }

    const { error: profileError } = await client.from('profiles').upsert({
      id: userId,
      name,
      role,
      branch_id: branchId,
      is_active: true,
      must_change_password: true,
    });
    if (profileError) {
      exceptions.push({ row: n, reason: `profile upsert failed: ${profileError.message}`, data: JSON.stringify(row) });
      continue;
    }
    upserted += 1;
  }

  writeExceptions('users', exceptions);
  console.log(`users: ${created} created, ${reused} reused, ${upserted} profiles upserted, ${exceptions.length} exceptions`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
