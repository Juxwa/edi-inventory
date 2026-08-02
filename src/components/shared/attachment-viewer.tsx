"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ViewableAttachment = { name: string; url: string };

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

// Compact "View" trigger per attachment, sharing one dialog with prev/next
// navigation across the full list. Images render inline; PDFs embed via
// iframe; anything else falls back to a download link. Used by visit-list.tsx
// and hearing-tests-table.tsx so doctors can audit test files without
// leaving the app.
export function AttachmentViewer({ attachments }: { attachments: ViewableAttachment[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const active = openIndex !== null ? attachments[openIndex] : null;
  const ext = active ? extensionOf(active.name) : "";
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isPdf = ext === "pdf";

  function goTo(delta: number) {
    setOpenIndex((current: number | null) => {
      if (current === null) return current;
      const next = current + delta;
      if (next < 0 || next >= attachments.length) return current;
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {attachments.map((att: ViewableAttachment, index: number) => (
          <Button
            key={`${att.url}-${index}`}
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            title={`View ${att.name}`}
            onClick={() => setOpenIndex(index)}
          >
            <Eye className="size-3.5" />
            View
          </Button>
        ))}
      </div>

      <Dialog
        open={openIndex !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setOpenIndex(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm font-medium">
              {active?.name}
            </DialogTitle>
          </DialogHeader>

          {active && isImage ? (
            <a href={active.url} target="_blank" rel="noreferrer" className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static asset */}
              <img
                src={active.url}
                alt={active.name}
                className="max-h-[70vh] w-auto rounded-md object-contain"
              />
            </a>
          ) : null}

          {active && isPdf ? (
            <iframe
              src={active.url}
              title={active.name}
              className="h-[75vh] w-full rounded-md border border-border"
            />
          ) : null}

          {active && !isImage && !isPdf ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm text-muted-foreground">
                Preview isn&apos;t available for this file type.
              </p>
              <a
                href={active.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Download {active.name}
              </a>
            </div>
          ) : null}

          {attachments.length > 1 ? (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={openIndex === 0}
                onClick={() => goTo(-1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {openIndex !== null ? openIndex + 1 : 0} of {attachments.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={openIndex === attachments.length - 1}
                onClick={() => goTo(1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
