import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Header } from "@/components/header";
import type { Profile } from "@/lib/supabase/profile";

type AppShellProps = {
  profile: Profile;
  branchName: string | null;
  children: React.ReactNode;
};

export function AppShell({ profile, branchName, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/edi-logo.png"
              alt="Ear Diagnostics Inc."
              width={140}
              height={32}
              className="h-6 w-auto"
              priority
            />
          </Link>
        </div>
        <Nav role={profile.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header profile={profile} branchName={branchName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
