"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelpIcon } from "lucide-react";
import { guideSlugForPathname } from "@/lib/guides";
import { Button } from "@/components/ui/button";

// Deep-links to the guide for the page the user is currently on.
export function HelpButton() {
  const pathname = usePathname();
  const slug = guideSlugForPathname(pathname);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      aria-label="Open the guide for this page"
      title="Help for this page"
    >
      <Link href={`/help/${slug}`}>
        <CircleHelpIcon />
      </Link>
    </Button>
  );
}
