import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";

export const runtime = "nodejs";
// Pages the whole table 1000 rows at a time and deletes in chunks of 200.
// 60s is the Vercel Hobby ceiling; a partial run is harmless here — the
// cutoff is two months wide, so whatever it misses today it deletes tomorrow.
export const maxDuration = 60;

/**
 * Scheduled cleanup of Colombia rows this platform no longer ingests.
 *
 * Was a cleanup for the "no submission deadline" hide rule (2026-09-05).
 * That rule is gone (2026-09-11): it hid genuine open tenders whose
 * deadline datos.gov.co had not synced yet — 18 of 37 rows on 2026-09-08,
 * 14 of them flagship — and the real intent moved into the ingestion gate,
 * which admits only Licitación pública modalidades
 * (isIngestedColombiaModalidad, lib/ingestion/colombia-mapper.ts).
 *
 * Re-pointing this route was not optional once that rule went. Deleting
 * "Colombia + no deadline" used to only ever remove rows nobody could see;
 * with the hide rule gone it would have deleted exactly the visible
 * flagship tenders the change was meant to bring back. It now targets what
 * was actually meant all along: rows whose modalidad the ingestion gate
 * would reject today — already-decided Contratación Directa / régimen
 * especial processes that entered before the gate existed.
 *
 * The 2-month cutoff counts from publication_date, matching scripts/purge-
 * old-tenders.ts's own "N months since publication" convention — the only
 * other age-based cutoff in this codebase — rather than tracking a "first
 * observed" timestamp this schema does not have. It is deliberately kept:
 * a row that the gate would reject is not urgent to remove, and the delay
 * leaves a window to notice a modalidad string this platform should have
 * been accepting.
 *
 * Same auth pattern as app/api/cron/tender-digest/route.ts (Bearer
 * CRON_SECRET).
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type Candidate = { slug: string; tender_number: string | null; title: { es?: string } | null };

async function runPurge(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  const cutoffIso = cutoff.toISOString();

  const candidates: Candidate[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title")
      .eq("country", "Colombia")
      // Modalidad, not "has no deadline" — see this route's header comment
      // for why that changed on 2026-09-11. `not.ilike` runs in Postgres,
      // so the accent-tolerant prefix match of
      // isIngestedColombiaModalidad() cannot be reused here: the two real
      // values differ only in their tail, and procedure_type stores the
      // modalidad verbatim, so matching the accented and unaccented spelling
      // of "Licitaci_n p_blica" with single-character wildcards covers both
      // without inventing a normalized column.
      .not("procedure_type", "ilike", "Licitaci_n p_blica%")
      .lt("publication_date", cutoffIso)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    candidates.push(...(data as unknown as Candidate[]));
    if (data.length < PAGE_SIZE) break;
  }

  if (dryRun || candidates.length === 0) {
    // A dry run is a manual inspection, not a scheduled pass, so it must not
    // refresh the heartbeat — otherwise running one by hand would mask a
    // scheduler that has stopped firing. Having nothing to delete is a real
    // run and does.
    if (!dryRun) await recordCronHeartbeat(supabase, "purge-stale-colombia", "ok", "没有到期项目");
    return NextResponse.json({ dryRun, cutoff: cutoffIso, candidateCount: candidates.length, slugs: candidates.map((c) => c.slug) });
  }

  let deletedCount = 0;
  const failed: string[] = [];

  for (const candidateChunk of chunk(candidates, CHUNK_SIZE)) {
    const slugs = candidateChunk.map((c) => c.slug);
    const { error } = await supabase.from("tenders").delete().in("slug", slugs);
    if (error) {
      console.error(`purge-stale-colombia: delete failed for chunk starting at "${slugs[0]}": ${error.message}`);
      failed.push(...slugs);
      continue;
    }
    deletedCount += slugs.length;

    const tombstoneRows = candidateChunk.map((c) => ({
      slug: c.slug,
      tender_number: c.tender_number,
      title: c.title?.es ?? null,
      deleted_at: new Date().toISOString(),
    }));
    const { error: tombstoneError } = await supabase.from("tender_manual_deletions").upsert(tombstoneRows, { onConflict: "slug" });
    if (tombstoneError) console.error(`purge-stale-colombia: failed to record tender_manual_deletions: ${tombstoneError.message}`);
  }

  if (failed.length > 0) {
    // Keyed on the job, not the slug: a delete failing here is almost always
    // one cause (a constraint, RLS, connectivity) hitting every chunk, so per
    // slug would mean dozens of identical emails.
    await reportOpsFailure(supabase, {
      source: "purge-stale-colombia:delete",
      title: "哥伦比亚过期项目清理失败",
      message: `${failed.length} 个项目删除失败，例如 ${failed.slice(0, 3).join("、")}`,
    });
  }
  await recordCronHeartbeat(supabase, "purge-stale-colombia", failed.length > 0 ? "failed" : "ok", failed.length > 0 ? `${failed.length} 个项目删除失败` : undefined);
  return NextResponse.json({ dryRun, cutoff: cutoffIso, deletedCount, failed });
}

/**
 * A throw anywhere above — Supabase unreachable, Stripe's API down, a schema
 * change — used to surface only as a 500 in Vercel's log. Unattended work
 * that fails has to reach a person; see lib/notifications/ops-alert.ts.
 */
export async function GET(request: NextRequest) {
  try {
    return await runPurge(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const admin = createSupabaseAdminClient();
    await recordCronHeartbeat(admin, "purge-stale-colombia", "failed", message);
    await reportOpsFailure(admin, { source: "purge-stale-colombia:run", title: "哥伦比亚过期项目清理任务失败", message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
