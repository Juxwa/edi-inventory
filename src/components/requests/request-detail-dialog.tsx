"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateAdminNotes } from "@/app/(app)/requests/actions";
import {
  initialRequestState,
  type RequestActionState,
} from "@/lib/validators/request";

export type RequestLineRowData = {
  id: string;
  product_name: string;
  quantity: number;
};

export function RequestLinesTable({ lines }: { lines: RequestLineRowData[] }) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium">No lines yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line: RequestLineRowData) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.product_name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdminNotesEditor({
  requestId,
  initialNotes,
}: {
  requestId: string;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    RequestActionState,
    FormData
  >(updateAdminNotes, initialRequestState);
  const [notes, setNotes] = useState(initialNotes ?? "");

  useEffect(() => {
    if (state.ok) {
      toast.success("Admin notes saved.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <textarea
        name="admin_notes"
        rows={3}
        disabled={pending}
        value={notes}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
          setNotes(event.target.value)
        }
        placeholder="Internal notes for this request"
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Save admin notes"}
        </Button>
      </div>
    </form>
  );
}
