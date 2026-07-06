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
  ProductEditDialog,
  type ProductCategoryOption,
  type SupplierOption,
} from "@/components/products/product-dialog";
import { setProductArchived } from "@/app/(app)/products/actions";

export type ProductRowData = {
  id: string;
  name: string;
  code: string | null;
  srp: number | null;
  has_serial: boolean;
  is_active: boolean;
  archived: boolean;
  description: string | null;
  notes: string | null;
  category_id: number | null;
  supplier_id: string | null;
  category_name: string | null;
  supplier_name: string | null;
};

type ProductTableProps = {
  products: ProductRowData[];
  categories: ProductCategoryOption[];
  suppliers: SupplierOption[];
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatSrp(srp: number | null): string {
  if (srp == null) return "—";
  return currencyFormatter.format(srp);
}

function ArchiveMenuItem({ product }: { product: ProductRowData }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await setProductArchived(product.id, !product.archived);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update product status.");
        return;
      }
      toast.success(
        product.archived ? "Product unarchived." : "Product archived.",
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
      variant={product.archived ? "default" : "destructive"}
    >
      {product.archived ? "Unarchive" : "Archive"}
    </DropdownMenuItem>
  );
}

export function ProductTable({
  products,
  categories,
  suppliers,
}: ProductTableProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No products match your search.</p>
        <p className="text-sm text-muted-foreground">
          Try a different search term or filter.
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
            <TableHead>Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-right">SRP</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product: ProductRowData) => (
            <ProductTableRow
              key={product.id}
              product={product}
              categories={categories}
              suppliers={suppliers}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductTableRow({
  product,
  categories,
  suppliers,
}: {
  product: ProductRowData;
  categories: ProductCategoryOption[];
  suppliers: SupplierOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {product.code ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {product.category_name ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {product.supplier_name ?? "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatSrp(product.srp)}
      </TableCell>
      <TableCell>
        {product.has_serial ? (
          <Badge variant="secondary">Serialized</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {product.archived ? (
          <Badge variant="outline">Archived</Badge>
        ) : product.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="warning">Inactive</Badge>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${product.name}`}
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
            <ArchiveMenuItem product={product} />
          </DropdownMenuContent>
        </DropdownMenu>

        <ProductEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          categories={categories}
          suppliers={suppliers}
          product={product}
        />
      </TableCell>
    </TableRow>
  );
}
