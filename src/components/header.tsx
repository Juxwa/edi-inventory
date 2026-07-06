import { LogOutIcon, UserIcon } from "lucide-react";
import { signOut } from "@/app/(app)/actions";
import type { Profile } from "@/lib/supabase/profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type HeaderProps = {
  profile: Profile;
  branchName: string | null;
};

const ROLE_LABEL: Record<Profile["role"], string> = {
  admin: "Admin",
  branch_rep: "Branch Rep",
  top_mgmt: "Top Management",
  technical: "Technical",
};

export function Header({ profile, branchName }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {branchName ? (
          <>
            <span className="font-medium text-foreground">{branchName}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>{ROLE_LABEL[profile.role]}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label="Account menu"
          >
            <UserIcon />
            <span>{profile.name ?? "User"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{profile.name ?? "User"}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABEL[profile.role]}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full cursor-default">
                <LogOutIcon />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
