import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

export const VISIT_FILES_BUCKET = "visit-files";
export const SIGNED_URL_TTL_SECONDS = 3600;

export type VisitRowData = {
  id: string;
  visit_date: string;
  purpose: string | null;
  purchased_during_visit: boolean;
  remarks: string | null;
  attachment_paths: string[] | null;
  is_hearing_test?: boolean;
  reviewed_at?: string | null;
};

export type AttachmentLink = { path: string; url: string | null; name: string };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function filenameFromPath(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

export async function resolveAttachmentLinks(
  paths: string[] | null,
): Promise<AttachmentLink[]> {
  if (!paths || paths.length === 0) return [];
  const supabase = await createClient();
  const results: AttachmentLink[] = [];
  for (const path of paths) {
    const { data } = await supabase.storage
      .from(VISIT_FILES_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    results.push({ path, url: data?.signedUrl ?? null, name: filenameFromPath(path) });
  }
  return results;
}

async function VisitAttachments({ paths }: { paths: string[] | null }) {
  const links = await resolveAttachmentLinks(paths);
  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {links.map((link: { path: string; url: string | null; name: string }) =>
        link.url ? (
          <a
            key={link.path}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            {link.name}
          </a>
        ) : (
          <span key={link.path} className="text-xs text-muted-foreground">
            {link.name} (unavailable)
          </span>
        ),
      )}
    </div>
  );
}

export function VisitList({ visits }: { visits: VisitRowData[] }) {
  if (visits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No visits logged yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {visits.map((visit: VisitRowData) => (
        <div key={visit.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{formatDate(visit.visit_date)}</span>
              {visit.purpose ? <Badge variant="outline">{visit.purpose}</Badge> : null}
              {visit.purchased_during_visit ? (
                <Badge variant="success">Purchase made</Badge>
              ) : null}
              {visit.is_hearing_test ? (
                <>
                  <Badge variant="secondary">Hearing test</Badge>
                  {visit.reviewed_at ? (
                    <Badge variant="success">
                      Reviewed {formatDate(visit.reviewed_at ?? null)}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Awaiting review</Badge>
                  )}
                </>
              ) : null}
            </div>
          </div>
          {visit.remarks ? (
            <p className="mt-2 text-sm text-muted-foreground">{visit.remarks}</p>
          ) : null}
          <VisitAttachments paths={visit.attachment_paths} />
        </div>
      ))}
    </div>
  );
}
