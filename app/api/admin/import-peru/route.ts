import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestPeruOece, ingestPeruOxi } from "@/lib/ingestion/ingest-peru";
import { isOeceEgressBlocked } from "@/lib/ingestion/connectors/peru-oece-live";
import { logAdminAlert } from "@/lib/admin-alerts";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as {
    source?: "oece" | "oxi";
    months?: number;
    days?: number;
    segment?: string;
    write?: boolean;
  };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const options = {
    write,
    months: Number.isFinite(body.months) ? Number(body.months) : undefined,
    days: Number.isFinite(body.days) ? Number(body.days) : undefined,
    segment: body.segment?.trim() || undefined,
  };

  try {
    const result = body.source === "oxi" ? await ingestPeruOxi(supabase, options) : await ingestPeruOece(supabase, options);
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    // Peru's SEACE proxy denies Vercel's datacenter range outright (confirmed
    // 2026-09-11, iad1). That is not a retry, a rate limit, or anything a
    // header changes — so the reply hands over the command that DOES work,
    // pre-filled with the settings just submitted, instead of an error the
    // admin has to translate into an action themselves.
    if (isOeceEgressBlocked(err)) {
      const flags = [
        options.segment ? `--segment ${options.segment}` : `--months ${options.months ?? 2}`,
        options.days ? `--days ${options.days}` : "",
        write ? "--write" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : String(err),
          egressBlocked: true,
          cliCommand: `npm run ingest:peru-live -- ${flags}`,
        },
        { status: 502 },
      );
    }
    await logAdminAlert(supabase, "import-peru", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
