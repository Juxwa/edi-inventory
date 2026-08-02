import 'dotenv/config';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { readCsv, clean, writeExceptions, Exception } from '../import/lib';

// Reads export_All-Users_*.csv + export_All-Branches_*.csv from
// data/exports and writes data/users.csv in the format bulk-users.ts
// expects (email,name,role,branch_code), so `npm run bulk-users` can
// create logins for the fresh Bubble export.

type Role = 'admin' | 'branch_rep' | 'top_mgmt' | 'technical';

// --- Role mapping (highest priority first) -------------------------------
// 1. Specific email override.
const ROLE_BY_EMAIL: Record<string, Role> = {
  'evp@eardiagnostics.com.ph': 'top_mgmt',
  'president_eardiagnostics@eardiagnostics.com.ph': 'top_mgmt',
};
// 2. AssociatedBranch override (applies regardless of the Role column).
const TECHNICAL_BRANCH = 'Technical/Repairs';
// 3. Fall back to the legacy Role column.
const ROLE_BY_LEGACY_ROLE: Record<string, Role> = {
  'Admin Staff': 'admin',
  'Branch Representative': 'branch_rep',
};
// ---------------------------------------------------------------------------

const EXTRA_ROW = {
  email: 'joshmisajon@gmail.com',
  name: 'Josh Misajon (Backend)',
  role: 'admin' as Role,
  branchName: 'EDI HQ',
};

const dir = 'data/exports';
function findFile(prefix: string): string {
  const match = readdirSync(dir).find((f: string) => f.startsWith(prefix));
  if (!match) throw new Error(`no export file starting with ${prefix}`);
  return `${dir}/${match}`;
}

type UserRow = Record<string, string>;

function resolveRole(row: UserRow): Role | null {
  const email = clean(row['email'])?.toLowerCase();
  if (email && ROLE_BY_EMAIL[email]) return ROLE_BY_EMAIL[email];

  const branch = clean(row['AssociatedBranch']);
  if (branch === TECHNICAL_BRANCH) return 'technical';

  const legacyRole = clean(row['Role']);
  return legacyRole ? ROLE_BY_LEGACY_ROLE[legacyRole] ?? null : null;
}

function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function main() {
  const usersFile = findFile('export_All-Users');
  const branchesFile = findFile('export_All-Branches');

  const branchRows = readCsv(branchesFile);
  // Same derivation as branches.ts's importer: code is read straight off
  // the "Branch Code" column, no transformation — so match branch names to
  // codes the same way.
  const codeByBranchName = new Map(
    branchRows.map((r) => [clean(r['Branch Name']), clean(r['Branch Code'])]),
  );

  const userRows = readCsv(usersFile);
  const exceptions: Exception[] = [];
  const outRows: { email: string; name: string; role: Role; branch_code: string }[] = [];

  userRows.forEach((row: UserRow, i: number) => {
    const n = i + 2;
    const email = clean(row['email']);
    const name = clean(row['Name']);
    if (!email) { exceptions.push({ row: n, reason: 'missing email', data: JSON.stringify(row) }); return; }
    if (!name) { exceptions.push({ row: n, reason: 'missing name', data: JSON.stringify(row) }); return; }

    const role = resolveRole(row);
    if (!role) {
      exceptions.push({ row: n, reason: `unknown role: ${row['Role']}`, data: JSON.stringify(row) });
      return;
    }

    const branchName = clean(row['AssociatedBranch']);
    const branchCode = branchName ? codeByBranchName.get(branchName) : null;
    if (branchName && !branchCode) {
      exceptions.push({ row: n, reason: `unknown branch: ${branchName}`, data: JSON.stringify(row) });
      return;
    }

    outRows.push({ email, name, role, branch_code: branchCode ?? '' });
  });

  // Extra row: not in the export, appended per instructions.
  const hqCode = codeByBranchName.get(EXTRA_ROW.branchName);
  if (!hqCode) {
    exceptions.push({ row: 0, reason: `unknown branch for extra row: ${EXTRA_ROW.branchName}`,
      data: JSON.stringify(EXTRA_ROW) });
  } else {
    outRows.push({ email: EXTRA_ROW.email, name: EXTRA_ROW.name, role: EXTRA_ROW.role, branch_code: hqCode });
  }

  mkdirSync('data', { recursive: true });
  const lines = ['email,name,role,branch_code',
    ...outRows.map((r) => [csvField(r.email), csvField(r.name), csvField(r.role), csvField(r.branch_code)].join(','))];
  writeFileSync('data/users.csv', lines.join('\n'));

  writeExceptions('generate-users-csv', exceptions);
  console.log(`generate-users-csv: wrote ${outRows.length}/${userRows.length + 1} rows to data/users.csv `
    + `(${exceptions.length} exceptions)`);
}

main();
