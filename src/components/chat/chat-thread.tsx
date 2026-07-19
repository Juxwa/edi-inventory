"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SendIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { chatMessageSchema } from "@/lib/validators/chat";
import {
  channelColumns,
  channelKey,
  messageMatchesChannel,
  type ChatChannel,
  type ChatMessageRow,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatThreadProps = {
  channel: ChatChannel;
  currentUserId: string;
  /** Fires for messages from other users (used for unread indicators). */
  onIncoming?: (message: ChatMessageRow) => void;
  emptyLabel?: string;
  className?: string;
};

const HISTORY_LIMIT = 200;
const MESSAGE_COLUMNS =
  "id, transfer_id, branch_a_id, branch_b_id, sender_id, body, created_at";

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${day}, ${time}`;
}

export function ChatThread({
  channel,
  currentUserId,
  onIncoming,
  emptyLabel = "No messages yet. Start the conversation.",
  className,
}: ChatThreadProps) {
  const supabase = useMemo(() => createClient(), []);
  const key = channelKey(channel);
  // Callers may recreate the channel object every render; the load effect
  // depends on the stable key and reads the latest object from this ref.
  const channelRef = useRef(channel);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [namesById, setNamesById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onIncomingRef = useRef(onIncoming);
  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);
  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  const appendMessage = useCallback((message: ChatMessageRow) => {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message],
    );
  }, []);

  // Note for callers: pass a React `key` derived from channelKey(channel) if
  // the channel can change, so the thread remounts with fresh initial state.
  useEffect(() => {
    let cancelled = false;
    const chan = channelRef.current;

    async function load() {
      let query = supabase.from("chat_messages").select(MESSAGE_COLUMNS);
      if (chan.kind === "transfer") {
        query = query.eq("transfer_id", chan.transferId);
      } else if (chan.kind === "branches") {
        query = query
          .eq("branch_a_id", chan.branchAId)
          .eq("branch_b_id", chan.branchBId);
      } else {
        query = query.is("transfer_id", null).is("branch_a_id", null);
      }

      const [messagesResult, profilesResult] = await Promise.all([
        query.order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
        supabase.from("profiles").select("id, name"),
      ]);

      if (cancelled) return;

      if (messagesResult.error) {
        setError("Could not load messages.");
      } else {
        setMessages(
          ((messagesResult.data as ChatMessageRow[] | null) ?? []).reverse(),
        );
      }

      const profileRows =
        (profilesResult.data as { id: string; name: string | null }[] | null) ??
        [];
      setNamesById(
        new Map(profileRows.map((row) => [row.id, row.name ?? "Unknown user"])),
      );
      setLoading(false);
    }

    load();

    // Realtime filters support a single column, so narrow where possible and
    // finish matching client-side (RLS already scopes what is delivered).
    const filter =
      chan.kind === "transfer"
        ? { filter: `transfer_id=eq.${chan.transferId}` }
        : chan.kind === "branches"
          ? { filter: `branch_a_id=eq.${chan.branchAId}` }
          : {};

    const realtimeChannel = supabase
      .channel(`chat:${key}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          ...filter,
        },
        (payload) => {
          const message = payload.new as ChatMessageRow;
          if (!messageMatchesChannel(message, chan)) return;
          appendMessage(message);
          if (message.sender_id !== currentUserId) {
            onIncomingRef.current?.(message);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(realtimeChannel);
    };
  }, [supabase, key, currentUserId, appendMessage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const parsed = chatMessageSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid message.");
      return;
    }

    setSending(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({
        ...channelColumns(channel),
        sender_id: currentUserId,
        body: parsed.data.body,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    setSending(false);

    if (insertError || !data) {
      setError("Could not send message. Please try again.");
      return;
    }

    appendMessage(data as ChatMessageRow);
    setDraft("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sending) send();
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-3"
        aria-live="polite"
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          messages.map((message) => {
            const own = message.sender_id === currentUserId;
            return (
              <div
                key={message.id}
                className={cn("flex flex-col", own ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    own
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {!own ? (
                    <p className="mb-0.5 text-xs font-semibold">
                      {namesById.get(message.sender_id) ?? "Unknown user"}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatMessageTime(message.created_at)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-3">
        {error ? (
          <p className="mb-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!sending) send();
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            rows={2}
            maxLength={2000}
            className="min-h-9 resize-none"
            aria-label="Message"
          />
          <Button
            type="submit"
            size="sm"
            disabled={sending || draft.trim().length === 0}
            aria-label="Send message"
          >
            <SendIcon />
          </Button>
        </form>
      </div>
    </div>
  );
}
