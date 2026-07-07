import { Badge } from "@/components/ui/badge";
import { STALE_DRAFT_DAYS, type TransferStatus } from "@/lib/validators/transfer";

function formatStatusLabel(status: TransferStatus): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  if (status === "draft") {
    return <Badge variant="secondary">{formatStatusLabel(status)}</Badge>;
  }
  if (status === "reserved") {
    return (
      <Badge className="border-transparent bg-amber-500 text-white">
        {formatStatusLabel(status)}
      </Badge>
    );
  }
  if (status === "in_transit") {
    return (
      <Badge className="border-transparent bg-blue-600 text-white">
        {formatStatusLabel(status)}
      </Badge>
    );
  }
  return <Badge variant="success">{formatStatusLabel(status)}</Badge>;
}

export function isStaleDraft(status: TransferStatus, createdAt: string): boolean {
  if (status !== "draft") return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  const ageMs = Date.now() - createdMs;
  return ageMs > STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
}

export function StaleDraftBadge() {
  return <Badge variant="outline">Stale</Badge>;
}
