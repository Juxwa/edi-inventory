"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SupplierEditDialog,
} from "@/components/suppliers/supplier-dialog";
import { setSupplierArchived } from "@/app/(app)/suppliers/actions";

export type SupplierRowData = {
  id: string;
  name: string;
  contact_person: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  is_stub: boolean;
};

type SupplierTableProps = {
  suppliers: SupplierRowData[];
};

function StatusMenuItem({ supplier }: { supplier: SupplierRowData }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await setSupplierArchived(
        supplier.id,
        !supplier.is_active,
      );
      if (!result.ok) {
        toast.error(result.error ?? "Could not update supplier status.");
        return;
      }
      toast.success(
        supplier.is_active
          ? "Supplier marked inactive."
          : "Supplier marked active.",
      );
    });
  }

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event: Event) => {
        event.preventDefault();
        handleClick();
      }}
      variant={supplier.is_active ? "destructive" : "default"}
    >
      {supplier.is_active ? "Mark inactive" : "Mark active"}
    </DropdownMenuItem>
  );
}

export function SupplierTable({ suppliers }: SupplierTableProps) {
  if (suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No suppliers match your search.</p>
        <p className="text-sm text-muted-foreground">
          Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact person</TableHead>
            <TableHead>Contact no.</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Payment terms</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier: SupplierRowData) => (
            <SupplierTableRow key={supplier.id} supplier={supplier} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SupplierTableRow({ supplier }: { supplier: SupplierRowData }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {supplier.name}
          {supplier.is_stub && (
            <Badge variant="warning">Needs details</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {supplier.contact_person ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {supplier.contact_no ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {supplier.email ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {supplier.payment_terms ?? "—"}
      </TableCell>
      <TableCell>
        {supplier.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${supplier.name}`}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(event: Event) => {
                event.preventDefault();
                setEditOpen(true);
              }}
            >
              Edit
            </DropdownMenuItem>
            <StatusMenuItem supplier={supplier} />
          </DropdownMenuContent>
        </DropdownMenu>

        <SupplierEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          supplier={supplier}
        />
      </TableCell>
    </TableRow>
  );
}
