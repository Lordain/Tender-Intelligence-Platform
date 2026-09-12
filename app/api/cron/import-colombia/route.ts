import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { ingestColombia, refreshColombiaTenders } from "@/lib/ingestion/ingest-colombia";
import { revalidateTenders } from "@/lib/cache-tags";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The daily SECOP II pull, unattended.
 *
 * Until now not one ingestion step in this project ran on its own — every
 * tender in the database is there because someone clicked a button. The gap
 * that matters is not the clicking: a source this platform stops reading for
 * a week looks exactly like a source with no new tenders, and Colombia's feed
 * is thin enough (about 11% of published licitaciones survive the relevance
 * rules) that the difference is invisible from the outside.
 *
 * Two passes, both cheap enough for one serverless invocation:
 *
 *  1. DISCOVER — `ingestColombia` over a one-month publication window. The
 *     connector applies its own server-side `%icitaci%` filter, so a real
 *     30-day window is ~550 rows, a single 1000-row page; maxPages 5 is
 *     headroom, not an expectation. A month rather than a day because
 *     datos.gov.co lags the portal by days (see the publish-to-visible
 *     measurement in lib/ingestion/README.md) — a daily window would miss
 *     exactly the tenders that arrive late, and re-reading a month costs one
 *     request.
 *
 *  2. REFRESH — `refreshColombiaTenders`, which re-reads the tenders we
 *     ALREADY track by reference, with no date filter at all. This is what
 *     moves a tender to 已中标, fills a submission deadline SECOP published
 *     after we first saw the row, and picks up an awarded provider. Discovery
 *     alone never updates a tender it already has.
 *
 * Documents are deliberately NOT fetched here (`fetchDocuments: false`).
 * Downloading bid documents is minutes of work and hundreds of megabytes, and
 * the user's own call on the PEMEX corpus was that the documents are not worth
 * pulling wholesale — it stays an explicit action on /admin/documents-needed.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

const DISCOVER_MONTHS = 1;
const DISCOVER_MAX_PAGES = 5;

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A dry run still fetches and maps — it is the only way to see what the
  // schedule WOULD write without waiting a day to find out.
  const write = new URL(request.url).searchParams.get("dryRun") !== "true";

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  const discovered = await ingestColombia(supabase, {
    months: DISCOVER_MONTHS,
    maxPages: DISCOVER_MAX_PAGES,
    write,
    fetchDocuments: false,
  });

  const refreshed = await refreshColombiaTenders(supabase, { write });

  const failed = [...(discovered.failed ?? []), ...(refreshed.failed ?? [])];
  if (failed.length > 0) {
    // Keyed on the job rather than the slug: a write failing here is almost
    // always one cause (RLS, a schema change, connectivity) hitting every row.
    await reportOpsFailure(supabase, {
      source: "import-colombia:write",
      title: "哥伦比亚自动导入部分失败",
      message: `${failed.length} 条写入失败，例如 ${failed.slice(0, 3).map((f) => f.slug).join("、")}`,
    });
  }

  if (write) revalidateTenders();

  await recordCronHeartbeat(
    supabase,
    "import-colombia",
    failed.length > 0 ? "failed" : "ok",
    failed.length > 0
      ? `${failed.length} 条写入失败`
      : `新增/更新 ${discovered.upsertedCount ?? 0} 条，刷新 ${refreshed.upsertedCount ?? 0} 条`,
  );

  return NextResponse.json({ write, discovered, refreshed });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const admin = createSupabaseAdminClient();
    await recordCronHeartbeat(admin, "import-colombia", "failed", message);
    await reportOpsFailure(admin, { source: "import-colombia:run", title: "哥伦比亚自动导入失败", message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
