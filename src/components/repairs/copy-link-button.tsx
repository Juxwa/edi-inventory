"use client";

import { LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ sarNo }: { sarNo: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        const url = `${window.location.origin}/repair-status?sar=${encodeURIComponent(sarNo)}`;
        await navigator.clipboard.writeText(url);
        toast.success("Status link copied. Share it with the customer.");
      }}
    >
      <LinkIcon className="size-4" />
      Copy status link
    </Button>
  );
}
