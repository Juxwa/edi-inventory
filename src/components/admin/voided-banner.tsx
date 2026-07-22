import { formatDate } from "@/lib/format";

// Prominent banner for voided/reversed records. Callers are responsible
// for also disabling their own other action buttons when voided.
export function VoidedBanner({
  label = "VOIDED",
  reason,
  actorName,
  when,
}: {
  label?: "VOIDED" | "REVERSED";
  reason: string | null;
  actorName: string | null;
  when: string | null;
}) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-semibold">
        {label}
        {reason ? ` — ${reason}` : ""}
      </p>
      <p className="text-xs opacity-90">
        {actorName ?? "Unknown"} · {when ? formatDate(when) : "—"}
      </p>
    </div>
  );
}
