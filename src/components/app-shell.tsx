import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Header } from "@/components/header";
import { ChatWidget } from "@/components/chat/chat-widget";
import { WelcomeTour } from "@/components/help/welcome-tour";
import type { Profile } from "@/lib/supabase/profile";

type AppShellProps = {
  profile: Profile;
  branchName: string | null;
  // Pinned between the header and the scrolling main area, so it stays put on
  // every page. Only the backend admin's view-as banner uses it.
  banner?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  profile,
  branchName,
  banner,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground print:hidden">
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
        {banner}
        {/* pb-24 keeps page content clear of the floating chat button */}
        <main className="flex-1 overflow-y-auto p-6 pb-24 print:pb-0">{children}</main>
      </div>

      <ChatWidget
        currentUserId={profile.id}
        role={profile.role}
        branchId={profile.branch_id}
      />
      <WelcomeTour role={profile.role} />
    </div>
  );
}
