// The HQ supervisor role is approvals-only: these are the only areas of the
// app it may open (the Approvals page and the user guide). Shared by the
// server guard in the (app) layout and the client guard in AppShell.
const SUPERVISOR_PATHS = ["/approvals", "/help"];

export function supervisorMayOpen(pathname: string): boolean {
  return SUPERVISOR_PATHS.some(
    (path: string) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
