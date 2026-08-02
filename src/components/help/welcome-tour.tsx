"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  CircleHelpIcon,
  CompassIcon,
  MessageCircleIcon,
} from "lucide-react";
import type { Profile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "edi:welcome-tour:v2";

const ROLE_BLURB: Record<Profile["role"], string> = {
  admin:
    "As head-office admin you receive stock, serve branch requests, manage the catalog, and administer users.",
  branch_rep:
    "As a branch representative you manage your branch’s stock, record sales, log customer visits, and request stock from head office.",
  top_mgmt:
    "As top management you have read access across all branches, plus sales and stock-movement reports.",
  technical:
    "As technical staff you work the repair and earmold queues and keep their status timelines up to date.",
};

type TourStep = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

export function WelcomeTour({ role }: { role: Profile["role"] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // localStorage is only readable after mount; the dialog opens once per
  // browser for first-time users and never again after dismissal. The short
  // delay lets the page paint first (and keeps setState out of the effect
  // body itself).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (!window.localStorage.getItem(STORAGE_KEY)) setOpen(true);
      } catch {
        // Storage unavailable (private mode): skip the tour rather than nag.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignore; the tour will show again next visit at worst.
    }
    setOpen(false);
  }

  const steps: TourStep[] = [
    {
      icon: <CompassIcon className="size-8 text-primary" aria-hidden="true" />,
      title: "Welcome to EDI Inventory",
      description: `${ROLE_BLURB[role]} This short tour shows you where everything lives — it takes about 30 seconds.`,
    },
    {
      icon: <BookOpenIcon className="size-8 text-primary" aria-hidden="true" />,
      title: "Find your way with the sidebar",
      description:
        "The left sidebar groups everything by function: Inventory, Sales, Customers, Transfers, Repairs, and Reports. You only see what your role can access, so if it’s in the menu, you can use it.",
    },
    {
      icon: (
        <CircleHelpIcon className="size-8 text-primary" aria-hidden="true" />
      ),
      title: "Help is one click away",
      description:
        "The question-mark button in the top bar opens the step-by-step guide for whichever page you are on. The full user guide is also in the sidebar under Support.",
    },
    {
      icon: (
        <MessageCircleIcon className="size-8 text-primary" aria-hidden="true" />
      ),
      title: "Chat with head office and branches",
      description:
        "The round chat button at the bottom-right opens the organization-wide chat. Each transfer also has its own Messages thread for discussing that specific shipment.",
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2">{current.icon}</div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex items-center justify-center gap-1.5"
          aria-label={`Step ${step + 1} of ${steps.length}`}
        >
          {steps.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "h-1.5 w-4 rounded-full bg-primary"
                  : "size-1.5 rounded-full bg-muted-foreground/30"
              }
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : null}
            {isLast ? (
              <>
                <Button asChild variant="outline" size="sm" onClick={dismiss}>
                  <Link href="/help">Open user guide</Link>
                </Button>
                <Button size="sm" onClick={dismiss}>
                  Get started
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
