"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "edi:analytics-legacy-note:v1";

// Dismissible, one-time-per-browser data caveat — see welcome-tour.tsx for
// the same localStorage pattern. Rendered hidden until after mount so we
// never flash it for a user who already dismissed it.
export function LegacyDataNote() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage unavailable (private mode): show the note every time.
      setVisible(true);
    }
  }, []);

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignore; the note will show again next visit at worst.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
      <p>
        Historical figures may understate revenue — some legacy records were
        imported without amounts (13,562 zero-price legacy sale lines).
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={dismiss}
        aria-label="Dismiss note"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
