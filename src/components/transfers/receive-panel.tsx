"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  received_note: string | null;
};

function isResolved(line: ReceiveLineRowData): boolean {
  return line.received_confirmed || line.received_note !== null;
}

function ConfirmLineForm({
  transferId,
  lineId,
}: {
  transferId: string;
  lineId: string;
}) {
  const router = useRouter();
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

  return (
    <form action={formAction}>
      <input type="hidden" name="transfer_id" value={transferId} />
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="confirm" value="true" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving..." : "Received"}
      </Button>
    </form>
  );
}

function ReportIssueForm({
  transferId,
  lineId,
}: {
  transferId: string;
  lineId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(receiveLine, initialTransferState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Discrepancy recorded.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Report issue
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="transfer_id" value={transferId} />
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="confirm" value="false" />
      <Input
        name="note"
        placeholder="Discrepancy note"
        required
        value={note}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setNote(event.target.value)
        }
        disabled={pending}
        className="h-8 w-48"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving..." : "Submit"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        Cancel
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
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="w-56">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line: ReceiveLineRowData) => {
            const resolved = isResolved(line);
            return (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.product_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {line.serial_snapshot ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity}
                </TableCell>
                <TableCell>
                  {line.received_confirmed
                    ? "Received"
                    : line.received_note
                      ? "Discrepancy"
                      : "Pending"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {line.received_note ?? "—"}
                </TableCell>
                <TableCell>
                  {resolved ? (
                    <span className="text-sm text-muted-foreground">Resolved</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ConfirmLineForm transferId={transferId} lineId={line.id} />
                      <ReportIssueForm transferId={transferId} lineId={line.id} />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
