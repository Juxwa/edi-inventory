-- Force a real password rotation before an account can touch any data.
--
-- 63 accounts share the temp password edi2026 with must_change_password=true.
-- The only enforcement was `if (must_change_password) redirect("/reset-password")`
-- in the (app) layout, but Next.js layouts do not wrap route handlers, server
-- actions, the landing page, or direct PostgREST calls with the anon key — so a
-- temp-password user could still read data through those paths.
--
-- Gate it at the source instead: auth_role()/auth_branch() now also return null
-- while must_change_password is true, so every RLS-scoped read/write fails
-- closed (exactly as it already does for inactive users, migration 0016) until
-- the password is actually rotated. This closes the route-handler, server-action
-- landing-page, and direct-PostgREST bypasses in one move.
--
-- Reset flow is unaffected: login is the auth API (not RLS); the (app) layout
-- reads the profile via profiles_read `using (true)` (migration 0013), which
-- does not call auth_role(), so it still sees the flag and redirects; the
-- reset page changes the password via the auth API; and the flag is cleared
-- with the service-role client, which bypasses RLS. Definitions preserve the
-- security definer / stable / search_path attributes from 0016 verbatim.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles
   where id = auth.uid() and is_active and not must_change_password $$;

create or replace function auth_branch() returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from profiles
   where id = auth.uid() and is_active and not must_change_password $$;
