import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { importPemexLive } from "@/lib/ingestion/import-pemex-live";
import { PEMEX_LIST_TITLES, KNOWN_BUYER_NAMES } from "@/lib/ingestion/pemex-sources";
import { revalidateTenders } from "@/lib/cache-tags";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The daily PEMEX pull, unattended.
 *
 * PEMEX publishes through seven separate SharePoint lists, one per
 * subsidiary. Each costs a list fetch plus one attachment request per kept
 * tender (four at a time) — call it ten seconds a list, which does not fit
 * seven times over in the 60-second ceiling this project's other cron routes
 * are written against.
 *
 * So the run takes a TIME BUDGET rather than a list count, and the order
 * ROTATES by day. Whatever is not reached today is first in line tomorrow,
 * and no list can be permanently starved by the ones ahead of it — which a
 * fixed order would do silently, and which is exactly the failure this whole
 * change exists to prevent. Nothing is lost to a partial run: the recency
 * window is two months wide, far wider than the few days a full rotation
 * takes.
 *
 * A skipped list is reported as `ok`, not `failed` — it is the design, not a
 * fault, and a job that cries wolf daily stops being read. Only a list that
 * actually threw is a failure.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Leaves room inside maxDuration for the list already running to finish and for the heartbeat write. */
const BUDGET_MS = 42_000;
const RECENCY_MONTHS = 2;

/** Day of year — so the starting list advances by one each day and every list leads the run once a week. */
function rotationOffset(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - startOfYear) / 86_400_000);
  return day % PEMEX_LIST_TITLES.length;
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const write = new URL(request.url).searchParams.get("dryRun") !== "true";

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  const startedAt = Date.now();
  const offset = rotationOffset(new Date());
  const order = PEMEX_LIST_TITLES.map((_, i) => PEMEX_LIST_TITLES[(i + offset) % PEMEX_LIST_TITLES.length]);

  const ran: { listTitle: string; upserted: number; kept: number }[] = [];
  const skipped: string[] = [];
  const errors: { listTitle: string; error: string }[] = [];
  const writeFailures: string[] = [];

  for (const listTitle of order) {
    if (Date.now() - startedAt > BUDGET_MS) {
      skipped.push(listTitle);
      continue;
    }
    const buyer = KNOWN_BUYER_NAMES[listTitle];
    if (!buyer) {
      // Every list in PEMEX_LIST_TITLES has a buyer name today; a new list
      // added without one would otherwise be imported under an empty buyer.
      errors.push({ listTitle, error: "没有对应的采购单位名称（KNOWN_BUYER_NAMES）" });
      continue;
    }
    try {
      const result = await importPemexLive(listTitle, buyer, { write, months: RECENCY_MONTHS });
      ran.push({ listTitle, upserted: result.upsertedCount ?? 0, kept: result.keptAfterRecencyCount });
      for (const f of result.failed ?? []) writeFailures.push(f.slug);
    } catch (error) {
      // One subsidiary's list being down must not cost the other six.
      errors.push({ listTitle, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (errors.length > 0) {
    await reportOpsFailure(supabase, {
      source: "import-pemex:list",
      title: "PEMEX 自动导入部分失败",
      message: errors.map((e) => `${e.listTitle}: ${e.error}`).join("\n").slice(0, 1500),
    });
  }
  if (writeFailures.length > 0) {
    await reportOpsFailure(supabase, {
      source: "import-pemex:write",
      title: "PEMEX 自动导入写入失败",
      message: `${writeFailures.length} 条写入失败，例如 ${writeFailures.slice(0, 3).join("、")}`,
    });
  }

  if (write && ran.length > 0) revalidateTenders();

  const upserted = ran.reduce((n, r) => n + r.upserted, 0);
  const failedRun = errors.length > 0 || writeFailures.length > 0;
  await recordCronHeartbeat(
    supabase,
    "import-pemex",
    failedRun ? "failed" : "ok",
    failedRun
      ? `${errors.length} 个列表出错，${writeFailures.length} 条写入失败`
      : `${ran.length}/${PEMEX_LIST_TITLES.length} 个列表，新增/更新 ${upserted} 条` +
        (skipped.length > 0 ? `（${skipped.length} 个列表超时未跑，明天优先）` : ""),
  );

  return NextResponse.json({ write, offset, ran, skipped, errors, writeFailures, elapsedMs: Date.now() - startedAt });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const admin = createSupabaseAdminClient();
    await recordCronHeartbeat(admin, "import-pemex", "failed", message);
    await reportOpsFailure(admin, { source: "import-pemex:run", title: "PEMEX 自动导入失败", message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
