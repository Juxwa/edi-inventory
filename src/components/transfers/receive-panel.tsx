"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { receiveLine } from "@/app/(app)/transfers/actions";
import {
  initialTransferState,
  type TransferActionState,
} from "@/lib/validators/transfer";

export type ReceiveLineRowData = {
  id: string;
  product_name: string;
  serial_snapshot: string | null;
  quantity: number;
  received_confirmed: boolean;
  received_quantity: number | null;
  received_note: string | null;
};

function isSerializedLine(line: ReceiveLineRowData): boolean {
  return line.serial_snapshot !== null && line.quantity === 1;
}

function isDiscrepant(line: ReceiveLineRowData): boolean {
  return (
    line.received_confirmed &&
    line.received_quantity !== null &&
    line.received_quantity < line.quantity
  );
}

function DiscrepancyBadge() {
  return <Badge variant="destructive">Discrepancy</Badge>;
}

function ReceiveLineForm({
  transferId,
  line,
}: {
  transferId: string;
  line: ReceiveLineRowData;
}) {
  const router = useRouter();
  const serialized = isSerializedLine(line);
  const [receivedQty, setReceivedQty] = useState<number>(line.quantity);
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(receiveLine, initialTransferState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Line received.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const mismatched = receivedQty !== line.quantity;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="transfer_id" value={transferId} />
      <input type="hidden" name="line_id" value={line.id} />
      <input type="hidden" name="received_quantity" value={receivedQty} />

      {serialized ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={receivedQty === 1 ? "default" : "outline"}
            disabled={pending}
            onClick={() => setReceivedQty(1)}
          >
            Received
          </Button>
          <Button
            type="button"
            size="sm"
            variant={receivedQty === 0 ? "default" : "outline"}
            disabled={pending}
            onClick={() => setReceivedQty(0)}
          >
            Not received
          </Button>
        </div>
      ) : (
        <Input
          type="number"
          min={0}
          max={line.quantity}
          step="any"
          value={receivedQty}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const value = Number.parseFloat(event.target.value);
            setReceivedQty(Number.isNaN(value) ? 0 : value);
          }}
          disabled={pending}
          className="h-8 w-24"
        />
      )}

      <Input
        name="note"
        placeholder={mismatched ? "Discrepancy note (required)" : "Note (optional)"}
        required={mismatched}
        value={note}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setNote(event.target.value)
        }
        disabled={pending}
        className={`h-8 w-56 ${mismatched ? "border-destructive" : ""}`}
      />

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving..." : "Confirm receipt"}
      </Button>
    </form>
  );
}

export function ReceivePanel({
  transferId,
  lines,
}: {
  transferId: string;
  lines: ReceiveLineRowData[];
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead className="text-right">Expected qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="w-80">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line: ReceiveLineRowData) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.product_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {line.serial_snapshot ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {line.received_confirmed
                    ? `Received ${line.received_quantity ?? 0} of ${line.quantity}`
                    : "Pending"}
                  {isDiscrepant(line) ? <DiscrepancyBadge /> : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {line.received_note ?? "—"}
              </TableCell>
              <TableCell>
                {line.received_confirmed ? (
                  <span className="text-sm text-muted-foreground">Resolved</span>
                ) : (
                  <ReceiveLineForm transferId={transferId} line={line} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
