"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/profile";

type NavItem = {
  href: string;
  label: string;
  roles: Profile["role"][];
};

type NavSection = {
  section: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    section: "Inventory",
    items: [
      {
        href: "/inventory",
        label: "Stock",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
      {
        href: "/inventory/intake",
        label: "Stock intake",
        roles: ["admin"],
      },
      {
        href: "/products",
        label: "Products",
        roles: ["admin", "top_mgmt"],
      },
      {
        href: "/suppliers",
        label: "Suppliers",
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
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
      {
        href: "/requests",
        label: "Stock requests",
        roles: ["admin", "branch_rep", "top_mgmt"],
      },
    ],
  },
  {
    section: "Coming soon",
    items: [],
  },
];

export function Nav({ role }: { role: Profile["role"] }) {
  const pathname = usePathname();

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
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
                    {item.label}
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
