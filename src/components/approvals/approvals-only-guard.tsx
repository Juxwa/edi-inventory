"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supervisorMayOpen } from "@/lib/approvals-only";

// The HQ supervisor role is approvals-only. The (app) layout redirects on a
// full page load; this covers client-side navigation, where layouts do not
// re-run. Access to data is enforced by RLS — this only keeps the UI on the
// pages the role can use (Approvals and the user guide).
export function ApprovalsOnlyGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = supervisorMayOpen(pathname);

  useEffect(() => {
    if (!allowed) router.replace("/approvals");
  }, [allowed, router]);

  return null;
}
