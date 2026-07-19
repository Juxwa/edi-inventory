"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircleIcon, XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { branchChannel, channelKey, type ChatChannel } from "@/lib/chat";
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

type Branch = { id: string; name: string };

type ChatWidgetProps = {
  currentUserId: string;
  role: Profile["role"];
  branchId: string | null;
};

const GENERAL = "general";

export function ChatWidget({ currentUserId, role, branchId }: ChatWidgetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  // "general" or a peer branch id (branch users), or an explicit pair
  // (branchless head-office users, who have no home branch to pair with).
  const [selection, setSelection] = useState<string>(GENERAL);
  const [pairA, setPairA] = useState<string>("");
  const [pairB, setPairB] = useState<string>("");
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("branches")
      .select("id, name")
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

  const isBranchless = branchId === null;
  const canPickPairs = isBranchless && (role === "admin" || role === "top_mgmt");
  const otherBranches = branches.filter((branch) => branch.id !== branchId);

  let channel: ChatChannel = { kind: "general" };
  let audienceLabel = "Everyone at Ear Diagnostics can see these messages";
  if (!isBranchless && selection !== GENERAL) {
    channel = branchChannel(branchId, selection);
    audienceLabel = `Between ${nameById.get(branchId) ?? "your branch"} and ${
      nameById.get(selection) ?? "the selected branch"
    } — plus head office`;
  } else if (
    canPickPairs &&
    selection !== GENERAL &&
    pairA &&
    pairB &&
    pairA !== pairB
  ) {
    channel = branchChannel(pairA, pairB);
    audienceLabel = `Between ${nameById.get(pairA) ?? "?"} and ${
      nameById.get(pairB) ?? "?"
    } — plus head office`;
  }

  const pairReady =
    selection === GENERAL ||
    (!isBranchless ? true : Boolean(pairA && pairB && pairA !== pairB));

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
              {!isBranchless
                ? otherBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      Chat with {branch.name}
                    </SelectItem>
                  ))
                : canPickPairs
                  ? [
                      <SelectItem key="pair" value="pair">
                        Between two branches…
                      </SelectItem>,
                    ]
                  : null}
            </SelectContent>
          </Select>

          {canPickPairs && selection !== GENERAL ? (
            <div className="flex items-center gap-2">
              <Select value={pairA} onValueChange={setPairA}>
                <SelectTrigger className="h-8" aria-label="First branch">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">and</span>
              <Select value={pairB} onValueChange={setPairB}>
                <SelectTrigger className="h-8" aria-label="Second branch">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((branch) => branch.id !== pairA)
                    .map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{audienceLabel}</p>
        </div>

        {pairReady ? (
          <ChatThread
            key={channelKey(channel)}
            channel={channel}
            currentUserId={currentUserId}
            onIncoming={handleIncoming}
            emptyLabel="No messages here yet. Say hello!"
            className="flex-1"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Pick two branches to open their channel.
            </p>
          </div>
        )}
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
