-- Enforce profiles.is_active at the RLS layer: a deactivated user's
-- auth_role()/auth_branch() now return null, failing every policy check
-- (fail closed). Residual gap: policies with bare `using (true)` (catalog
-- reads, customers_read, visits_read, profiles_read) still admit a
-- deactivated user's not-yet-expired JWT; mitigated because deactivation in
-- the admin UI also bans the auth user (blocks sign-in and token refresh),
-- so exposure is bounded by the access-token TTL (~1h).
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and is_active $$;

create or replace function auth_branch() returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from profiles where id = auth.uid() and is_active $$;
