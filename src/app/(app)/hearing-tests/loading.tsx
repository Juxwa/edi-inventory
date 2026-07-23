export default function HearingTestsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="rounded-lg border border-border">
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: 8 }).map((_, index: number) => (
            <div key={index} className="h-12 animate-pulse bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
