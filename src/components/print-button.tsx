"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      <PrinterIcon className="size-4" />
      Print
    </Button>
  );
}
