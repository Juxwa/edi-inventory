"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ApproverTier, Profile } from "@/lib/supabase/profile";

type NavItem = {
  href: string;
  label: string;
  roles: Profile["role"][];
  // Shown to approvers (HQ staff / supervisor) regardless of roles, with
  // this label and the pending-request count.
  approverLabel?: string;
};

type NavSection = {
  section: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    section: "Home",
    items: [
      {
        href: "/",
        label: "Dashboard",
        roles: ["admin", "branch_rep", "top_mgmt", "technical"],
      },
    ],
  },
  {
    section: "Inventory",
    items: [
      {
        href: "/inventory",
        label: "Stock",
        roles: ["admin", "branch_rep", "technical"],
      },
      {
        href: "/inventory/intake",
        label: "Add New Inventory",
        roles: ["admin"],
      },
      {
        href: "/products",
        label: "Manage Products",
        roles: ["admin"],
      },
      {
        href: "/suppliers",
        label: "Manage Suppliers",
        roles: ["admin"],
      },
      {
        href: "/pricing",
        label: "Service pricing",
        roles: ["admin", "branch_rep", "technical"],
      },
    ],
  },
  {
    section: "Sales",
    items: [
      {
        href: "/sales/new",
        label: "Record sale",
        roles: ["admin", "branch_rep"],
      },
      {
        href: "/sales",
        label: "Sales history",
        roles: ["admin", "branch_rep"],
      },
    ],
  },
  {
    section: "Customers",
    items: [
      {
        href: "/customers",
        label: "Customers",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
    ],
  },
  {
    section: "Clinical",
    items: [
      {
        href: "/hearing-tests",
        label: "Hearing tests",
        roles: ["admin", "top_mgmt"],
      },
    ],
  },
  {
    section: "Transfers",
    items: [
      {
        href: "/transfers",
        label: "Transfers",
        roles: ["admin", "branch_rep", "technical"],
      },
      {
        href: "/requests",
        label: "Stock requests",
        roles: ["admin", "branch_rep", "technical"],
      },
    ],
  },
  {
    section: "Repairs",
    items: [
      {
        href: "/repairs",
        label: "Repairs",
        roles: ["admin", "branch_rep", "top_mgmt", "technical"],
      },
      {
        href: "/repairs/new",
        label: "Repair intake",
        roles: ["admin", "branch_rep", "technical"],
      },
      {
        href: "/earmolds",
        label: "Earmolds",
        roles: ["admin", "branch_rep", "top_mgmt", "technical"],
      },
    ],
  },
  {
    section: "Reports",
    items: [
      {
        href: "/reports/sales",
        label: "Sales report",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
      {
        href: "/reports/movements",
        label: "Stock movements",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
      {
        href: "/analytics",
        label: "Analytics",
        roles: ["admin", "top_mgmt"],
      },
    ],
  },
  {
    section: "Corrections",
    items: [
      {
        href: "/approvals",
        label: "Void & return requests",
        approverLabel: "Approvals",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
    ],
  },
  {
    section: "Admin",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        roles: ["admin"],
      },
      {
        href: "/admin/corrections",
        label: "Corrections log",
        roles: ["admin"],
      },
      {
        href: "/admin/duplicates",
        label: "Duplicate serials",
        roles: ["admin"],
      },
    ],
  },
  {
    section: "Support",
    items: [
      {
        href: "/help",
        label: "User guide",
        roles: ["admin", "branch_rep", "top_mgmt", "technical", "supervisor"],
      },
    ],
  },
];

export function Nav({
  role,
  approver = null,
  pendingApprovals = 0,
}: {
  role: Profile["role"];
  approver?: ApproverTier | null;
  // Requests waiting for a decision; only shown to approvers.
  pendingApprovals?: number;
}) {
  const pathname = usePathname();

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.roles.includes(role) || (approver !== null && item.approverLabel !== undefined),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 px-3 py-4">
      {sections.map((section) => (
        <div key={section.section} className="flex flex-col gap-1">
          <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
            {section.section}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {approver !== null && item.approverLabel ? item.approverLabel : item.label}
                    {approver !== null && item.approverLabel && pendingApprovals > 0 ? (
                      <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold leading-5 text-white tabular-nums">
                        {pendingApprovals}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
