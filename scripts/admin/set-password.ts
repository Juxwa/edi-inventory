// Set a user's password directly via the admin API (bypasses email entirely).
// Usage (from app/):
//   npx tsx --env-file=.env.local scripts/admin/set-password.ts user@email.com NewPassword123
// Also flags the profile to force a password change at next login when the
// column exists (0030_must_change_password).
import { createClient } from '@supabase/supabase-js';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('usage: set-password.ts <email> <new-password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('password must be at least 8 characters');
    process.exit(1);
  }

  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Find the user by email (paged; team size makes one page plenty).
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const user = list.users.find(
    (candidate: { email?: string }) =>
      (candidate.email ?? '').toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    console.error(`no user found with email ${email}`);
    process.exit(1);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
  });
  if (updateError) throw updateError;
  console.log(`password set for ${email}`);

  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', user.id);
  if (flagError) {
    console.warn(
      `note: could not set must_change_password (${flagError.message}) — ` +
        'user keeps the assigned password until they change it themselves',
    );
  } else {
    console.log('user will be required to choose a new password at next login');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
