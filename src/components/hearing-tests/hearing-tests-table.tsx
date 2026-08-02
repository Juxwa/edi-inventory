"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { reviewHearingTest, linkVisitSale } from "@/app/(app)/hearing-tests/actions";
import {
  initialHearingTestState,
  type HearingTestActionState,
} from "@/lib/validators/hearing-test";
import { SaleLinkForm } from "@/components/shared/sale-link-form";
import { AttachmentViewer, type ViewableAttachment } from "@/components/shared/attachment-viewer";

export type AttachmentLinkData = { path: string; url: string | null; name: string };

export type CustomerSaleOption = {
  id: string;
  sale_date: string;
  or_no: string | null;
};

export type HearingTestVisitRow = {
  id: string;
  visit_date: string;
  customer_id: string;
  customer_name: string;
  branch_name: string;
  purchased_during_visit: boolean;
  attachments: AttachmentLinkData[];
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  resulted_in_sale_id: string | null;
  linked_sale_or_no: string | null;
  customer_sales: CustomerSaleOption[];
};

function ReviewForm({ visit }: { visit: HearingTestVisitRow }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<HearingTestActionState, FormData>(
    reviewHearingTest,
    initialHearingTestState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Marked reviewed.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="visit_id" value={visit.id} />
      <label className="text-sm font-medium" htmlFor={`notes-${visit.id}`}>
        Review notes
      </label>
      <Textarea
        id={`notes-${visit.id}`}
        name="review_notes"
        rows={3}
        disabled={pending}
        defaultValue={visit.review_notes ?? ""}
      />
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Mark reviewed"}
        </Button>
      </div>
    </form>
  );
}

function HearingTestRowDialog({ visit }: { visit: HearingTestVisitRow }) {
  const [open, setOpen] = useState(false);
  const viewable: ViewableAttachment[] = visit.attachments
    .filter((link: AttachmentLinkData): link is AttachmentLinkData & { url: string } => link.url !== null)
    .map((link: AttachmentLinkData & { url: string }) => ({ name: link.name, url: link.url }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{visit.customer_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              Test file(s)
            </p>
            {visit.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No file uploaded.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {visit.attachments.map((link: AttachmentLinkData) =>
                  link.url ? (
                    <a
                      key={link.path}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <span key={link.path} className="text-sm text-muted-foreground">
                      {link.name} (unavailable)
                    </span>
                  ),
                )}
                <AttachmentViewer attachments={viewable} />
              </div>
            )}
          </div>

          <ReviewForm visit={visit} />
          <SaleLinkForm
            visitId={visit.id}
            currentSaleId={visit.resulted_in_sale_id}
            saleOptions={visit.customer_sales}
            action={linkVisitSale}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HearingTestsTable({ rows }: { rows: HearingTestVisitRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No hearing-test visits match your filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Visit date</TableHead>
            <TableHead>Purchased</TableHead>
            <TableHead>Linked sale</TableHead>
            <TableHead>Reviewed</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((visit: HearingTestVisitRow) => (
            <TableRow key={visit.id}>
              <TableCell className="font-medium">{visit.customer_name}</TableCell>
              <TableCell>{visit.branch_name}</TableCell>
              <TableCell>{formatDate(visit.visit_date)}</TableCell>
              <TableCell>
                {visit.purchased_during_visit ? (
                  <Badge variant="success">Purchase made</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {visit.resulted_in_sale_id ? (
                  <Badge variant="secondary">OR {visit.linked_sale_or_no ?? "—"}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {visit.reviewed_at ? (
                  <div className="flex flex-col gap-0.5">
                    <Badge variant="success">Reviewed</Badge>
                    <span className="text-xs text-muted-foreground">
                      {visit.reviewed_by_name ?? "—"} · {formatDate(visit.reviewed_at)}
                    </span>
                  </div>
                ) : (
                  <Badge variant="warning">Unreviewed</Badge>
                )}
              </TableCell>
              <TableCell>
                <HearingTestRowDialog visit={visit} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
