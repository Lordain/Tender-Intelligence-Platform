import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { backfillPeruDocumentLinks } from "@/lib/ingestion/ingest-peru";
import { isOeceEgressBlocked } from "@/lib/ingestion/connectors/peru-oece-live";

export const runtime = "nodejs";
/** A full 6-month backfill is ~40k records over hundreds of sequential pages; nothing about it fits a serverless budget, which is a second reason it belongs on a local dev server. */
export const maxDuration = 300;

/**
 * Local-only, for a different reason than /admin/local-batch.
 *
 * That route reads the server's own filesystem, so on a deployed instance it
 * would be an arbitrary-path file reader. This one is harmless — it just
 * cannot work: it calls SEACE, and Peru's proxy refuses Vercel's datacenter
 * range outright (confirmed 2026-09-11, iad1 — see README.md, "Peru SEACE is
 * CLI-only on a deployed instance"). Shipping it there would be a button that
 * spends two minutes of the admin's attention to produce a 403.
 *
 * Checked at request time rather than by not shipping the file: a build-time
 * exclusion is easy to get wrong and silent when it is.
 */
function localOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "补齐标书链接只能在本机运行（npm run dev）——秘鲁官方接口拒绝机房 IP。" },
      { status: 404 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = localOnly();
  if (blocked) return blocked;

  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    months?: number;
    segment?: string;
    write?: boolean;
  };
  const write = body.write === true;

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  try {
    const result = await backfillPeruDocumentLinks(supabase, {
      write,
      months: Number.isFinite(body.months) ? Number(body.months) : undefined,
      segment: body.segment?.trim() || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    // Reachable on a dev server behind a VPN or a datacenter connection — the
    // localOnly() gate only rules out the deployed instance.
    if (isOeceEgressBlocked(err)) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), egressBlocked: true },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
