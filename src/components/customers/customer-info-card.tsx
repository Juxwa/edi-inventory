"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomerEditDialog,
  type CustomerRecord,
} from "@/components/customers/customer-dialog";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomerInfoCard({ customer }: { customer: CustomerRecord }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Customer details</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <PencilIcon className="size-4" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Mobile</p>
          <p className="font-medium">{customer.mobile_no ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Email</p>
          <p className="font-medium">{customer.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Date of birth</p>
          <p className="font-medium">{formatDate(customer.date_of_birth)}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">Address</p>
          <p className="font-medium">{customer.address ?? "—"}</p>
        </div>
      </CardContent>

      <CustomerEditDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
    </Card>
  );
}
