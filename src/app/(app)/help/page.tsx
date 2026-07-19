import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { getProfile } from "@/lib/supabase/profile";
import { GUIDES, guidesForRole } from "@/lib/guides";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "User guide" };

export default async function HelpIndexPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const featured = guidesForRole(profile.role);
  const others = GUIDES.filter((guide) => !guide.roles.includes(profile.role));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpenIcon className="size-5" aria-hidden="true" />
          User guide
        </h1>
        <p className="text-sm text-muted-foreground">
          Step-by-step guides for everything in the app. You can also open the
          guide for the page you are on with the question-mark button in the
          top bar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {featured.map((guide) => (
          <Link
            key={guide.slug}
            href={`/help/${guide.slug}`}
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle>{guide.title}</CardTitle>
                <CardDescription>{guide.summary}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {others.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Other guides
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {others.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/help/${guide.slug}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {guide.title}
                </Link>{" "}
                <span className="text-muted-foreground">— {guide.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
