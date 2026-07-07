export default function SalesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="grid gap-2">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      </div>

      <div className="flex gap-3">
        <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: 8 }).map((_, index: number) => (
            <div key={index} className="h-11 animate-pulse bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
