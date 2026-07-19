import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getGuide, GUIDES } from "@/lib/guides";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GuidePageProps = {
  params: Promise<{ topic: string }>;
};

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ topic: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps) {
  const { topic } = await params;
  const guide = getGuide(topic);
  return { title: guide ? `${guide.title} — User guide` : "User guide" };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { topic } = await params;
  const guide = getGuide(topic);
  if (!guide) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/help"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          All guides
        </Link>
        <h1 className="text-lg font-semibold">{guide.title}</h1>
        <p className="text-sm text-muted-foreground">{guide.summary}</p>
      </div>

      {guide.sections.map((section) => (
        <Card key={section.heading}>
          <CardHeader>
            <CardTitle>{section.heading}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {section.body?.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.steps ? (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                {section.steps.map((step) => (
                  <li key={step} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            ) : null}
            {section.tips ? (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
                {section.tips.map((tip) => (
                  <li key={tip} className="leading-relaxed">
                    {tip}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
