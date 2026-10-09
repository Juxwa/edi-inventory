"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// The HQ supervisor role is approvals-only. The (app) layout redirects on a
// full page load; this covers client-side navigation, where layouts do not
// re-run. Access to data is enforced by RLS — this only keeps the UI on the
// one page the role can use.
export function ApprovalsOnlyGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = pathname === "/approvals" || pathname.startsWith("/approvals/");

  useEffect(() => {
    if (!allowed) router.replace("/approvals");
  }, [allowed, router]);

  return null;
}
