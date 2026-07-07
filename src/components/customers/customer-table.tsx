"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CustomerRowData = {
  id: string;
  name: string;
  mobile_no: string | null;
  email: string | null;
  address: string | null;
  branch_name: string;
  created_at: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomerTable({ customers }: { customers: CustomerRowData[] }) {
  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No customers match your search.</p>
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
            <TableHead>Mobile</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Branch created</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer: CustomerRowData) => (
            <TableRow key={customer.id}>
              <TableCell className="font-medium">
                <Link href={`/customers/${customer.id}`} className="hover:underline">
                  {customer.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.mobile_no ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.email ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.address ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.branch_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(customer.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
