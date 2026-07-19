import Image from "next/image";
import { LookupForm } from "@/components/repair-status/lookup-form";

export const dynamic = "force-dynamic";

type RepairStatusPageProps = {
  searchParams: Promise<{ sar?: string }>;
};

export default async function RepairStatusPage({
  searchParams,
}: RepairStatusPageProps) {
  const params = await searchParams;
  const initialSar = params.sar?.trim() ?? "";

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <Image
          src="/edi-logo.png"
          alt="Ear Diagnostics Inc."
          width={40}
          height={40}
          className="rounded"
        />
        <div>
          <h1 className="text-lg font-semibold">Ear Diagnostics Inc.</h1>
          <p className="text-sm text-muted-foreground">Repair status lookup</p>
        </div>
      </div>

      <LookupForm initialSar={initialSar} />

      <p className="text-xs text-muted-foreground">
        Enter the SAR number from your service acknowledgement receipt and the
        phone number you provided at the branch. For questions, contact your
        branch directly.
      </p>
    </main>
  );
}
