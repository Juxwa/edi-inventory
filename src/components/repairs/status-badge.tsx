import { Badge } from "@/components/ui/badge";
import type { RepairStatus, RepairEventStatus } from "@/lib/validators/repair";

export function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  if (status === "pending") {
    return <Badge variant="secondary">{formatStatusLabel(status)}</Badge>;
  }
  if (status === "in_progress") {
    return (
      <Badge className="border-transparent bg-blue-600 text-white">
        {formatStatusLabel(status)}
      </Badge>
    );
  }
  if (status === "for_replacement") {
    return <Badge variant="warning">{formatStatusLabel(status)}</Badge>;
  }
  return <Badge variant="success">{formatStatusLabel(status)}</Badge>;
}

export function RepairEventBadge({ status }: { status: RepairEventStatus }) {
  if (status === "returned") {
    return <Badge variant="success">{formatStatusLabel(status)}</Badge>;
  }
  if (status === "ready") {
    return (
      <Badge className="border-transparent bg-blue-600 text-white">
        {formatStatusLabel(status)}
      </Badge>
    );
  }
  return <Badge variant="secondary">{formatStatusLabel(status)}</Badge>;
}
