"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircleIcon, XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { headOfficeChannel, channelKey, type ChatChannel } from "@/lib/chat";
import type { Profile } from "@/lib/supabase/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatThread } from "@/components/chat/chat-thread";

type Branch = { id: string; name: string; is_head_office: boolean };

type ChatWidgetProps = {
  currentUserId: string;
  role: Profile["role"];
  branchId: string | null;
};

const GENERAL = "general";
const HEAD_OFFICE = "head-office";

export function ChatWidget({ currentUserId, role, branchId }: ChatWidgetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  // "general", "head-office" (branch users' single HQ channel), or a picked
  // branch id (HQ / branchless head-office users choosing which branch).
  const [selection, setSelection] = useState<string>(GENERAL);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("branches")
      .select("id, name, is_head_office")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setBranches((data as Branch[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleIncoming = useCallback(() => {
    if (!openRef.current) setUnread(true);
  }, []);

  const nameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const hqBranch = branches.find((branch) => branch.is_head_office) ?? null;
  const hasHeadOffice = hqBranch !== null;
  const isBranchless = branchId === null;
  const isHqBranchUser = hqBranch !== null && branchId === hqBranch.id;
  // Branch reps (a real, non-HQ home branch) get exactly one HQ channel.
  // HQ-based staff and branchless admin/top_mgmt get a picker over every
  // other branch, each opening that branch's HQ channel.
  const canPickBranch =
    hasHeadOffice &&
    (isHqBranchUser || (isBranchless && (role === "admin" || role === "top_mgmt")));
  const isBranchRep = hasHeadOffice && !isBranchless && !isHqBranchUser;
  const pickableBranches = hqBranch
    ? branches.filter((branch) => branch.id !== hqBranch.id)
    : [];

  let channel: ChatChannel = { kind: "general" };
  let audienceLabel = "Everyone at Ear Diagnostics can see these messages";
  if (isBranchRep && selection === HEAD_OFFICE && hqBranch) {
    channel = headOfficeChannel(branchId as string, hqBranch.id);
    audienceLabel = `Between ${nameById.get(branchId as string) ?? "your branch"} and head office`;
  } else if (canPickBranch && selection !== GENERAL && hqBranch) {
    channel = headOfficeChannel(selection, hqBranch.id);
    audienceLabel = `Between head office and ${
      nameById.get(selection) ?? "the selected branch"
    }`;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 print:hidden">
      <div
        className={cn(
          "flex h-[28rem] w-80 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg sm:w-96",
          open ? "flex" : "hidden",
        )}
        role="dialog"
        aria-label="Chat"
      >
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Chat</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <XIcon />
            </Button>
          </div>

          <Select value={selection} onValueChange={setSelection}>
            <SelectTrigger className="h-8" aria-label="Chat channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERAL}>General — whole organization</SelectItem>
              {isBranchRep ? (
                <SelectItem value={HEAD_OFFICE}>Head office</SelectItem>
              ) : null}
              {canPickBranch
                ? pickableBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      Chat with {branch.name}
                    </SelectItem>
                  ))
                : null}
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground">{audienceLabel}</p>
        </div>

        <ChatThread
          key={channelKey(channel)}
          channel={channel}
          currentUserId={currentUserId}
          onIncoming={handleIncoming}
          emptyLabel="No messages here yet. Say hello!"
          className="flex-1"
        />
      </div>

      <Button
        onClick={() => {
          setOpen((prev) => !prev);
          setUnread(false);
        }}
        size="icon"
        className="relative size-12 rounded-full shadow-lg"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        <MessageCircleIcon className="size-5" />
        {unread && !open ? (
          <span
            className="absolute right-1 top-1 size-2.5 rounded-full bg-destructive"
            aria-label="Unread messages"
          />
        ) : null}
      </Button>
    </div>
  );
}
