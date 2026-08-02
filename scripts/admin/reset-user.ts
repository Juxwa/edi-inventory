// One-off: reset a single user's password back to the temp value and
// re-arm the forced-change flag. Usage:
//   npm run reset-user -- <email> [password]
// Password defaults to "edi2026". Uses the same service client as the
// import/bulk-user scripts.
import { serviceClient } from "../import/lib";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3] ?? "edi2026";
  if (!email) {
    console.error("usage: npm run reset-user -- <email> [password]");
    process.exit(1);
  }

  const admin = serviceClient();

  // Find the auth user by email (paginate defensively).
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    console.error(`no auth user found for ${email}`);
    process.exit(1);
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwErr) throw pwErr;

  const { error: flagErr } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (flagErr) throw flagErr;

  console.log(`reset ${email}: password set, must_change_password re-armed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
