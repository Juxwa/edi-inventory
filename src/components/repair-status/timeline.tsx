import { CheckIcon } from "lucide-react";
import type { PublicRepairEvent } from "@/lib/repair-lookup";

const STEPS = [
  { status: "received", label: "Received" },
  { status: "assessed", label: "Assessed" },
  { status: "in_repair", label: "In Repair" },
  { status: "ready", label: "Ready" },
  { status: "returned", label: "Returned" },
] as const;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PublicTimeline({ events }: { events: PublicRepairEvent[] }) {
  const reachedStatuses = new Set(events.map((event: PublicRepairEvent) => event.status));
  // Highest reached step marks everything before it as done.
  let highestIndex = -1;
  STEPS.forEach((step, index: number) => {
    if (reachedStatuses.has(step.status)) highestIndex = index;
  });

  return (
    <div className="flex flex-col gap-8">
      <ol className="flex items-start justify-between">
        {STEPS.map((step, index: number) => {
          const done = index <= highestIndex;
          const current = index === highestIndex;
          return (
            <li key={step.status} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${index === 0 ? "invisible" : ""} ${
                    index <= highestIndex ? "bg-primary" : "bg-border"
                  }`}
                />
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {done ? <CheckIcon className="size-4" /> : index + 1}
                </span>
                <span
                  className={`h-0.5 flex-1 ${
                    index === STEPS.length - 1 ? "invisible" : ""
                  } ${index < highestIndex ? "bg-primary" : "bg-border"}`}
                />
              </div>
              <span
                className={`text-center text-xs ${
                  current ? "font-semibold" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {events.length > 0 ? (
        <ol className="flex flex-col gap-3 border-t border-border pt-4">
          {[...events].reverse().map((event: PublicRepairEvent, index: number) => {
            const step = STEPS.find((candidate) => candidate.status === event.status);
            return (
              <li key={index} className="flex flex-col gap-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{step?.label ?? event.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(event.created_at)}
                  </span>
                </div>
                {event.note ? (
                  <p className="text-muted-foreground">{event.note}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
