import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RepairEventBadge } from "@/components/repairs/status-badge";
import type { RepairEventStatus } from "@/lib/validators/repair";

export type RepairEventData = {
  id: number;
  status: RepairEventStatus;
  note: string | null;
  is_public: boolean;
  actor_name: string | null;
  created_at: string;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventTimeline({ events }: { events: RepairEventData[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No status updates yet.</p>
    );
  }

  return (
    <ol className="flex flex-col">
      {events.map((event: RepairEventData, index: number) => (
        <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
            {index < events.length - 1 ? (
              <span className="w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <RepairEventBadge status={event.status} />
              {!event.is_public ? (
                <Badge variant="outline">
                  <LockIcon className="size-3" />
                  Internal
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(event.created_at)}
                {event.actor_name ? ` · ${event.actor_name}` : ""}
              </span>
            </div>
            {event.note ? <p className="text-sm">{event.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
