import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

/**
 * Scheduled cleanup for the "no submission deadline" hide rule (see
 * isHiddenColombiaNoDeadline() in lib/db/tenders.ts) — explicit request,
 * 2026-09-05: a Colombia tender hidden for this reason should stay hidden
 * as long as it lacks a deadline, but if it's been published for 2 months
 * and still never got one, delete it outright rather than leave it
 * parked forever. Most of these are already-decided "Contratación
 * Directa"/"régimen especial" processes with nothing left to bid on (see
 * lib/ingestion/README.md's investigation) — 2 months is long enough for
 * a genuinely-just-lagging datos.gov.co sync (the deadline-sync gap also
 * documented there) to have caught up if it was ever going to.
 *
 * Cutoff counts from publication_date, matching scripts/purge-old-
 * tenders.ts's own existing "N months since publication" convention —
 * the only other age-based cutoff in this codebase — rather than tracking
 * a separate "first observed with no deadline" timestamp this schema
 * doesn't have.
 *
 * Same auth pattern as app/api/cron/tender-digest/route.ts (Bearer
 * CRON_SECRET) — wire this route up to a Vercel Cron Job (or whatever
 * external scheduler already triggers tender-digest) on whatever cadence
 * makes sense (daily is plenty, since the cutoff itself is 2 months wide).
 * Deletes for real by default once authorized; pass ?dryRun=true to only
 * report what WOULD be deleted, same escape hatch purge-old-tenders.ts's
 * CLI offers via its own default dry-run.
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

export async function GET(request: NextRequest) {
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
      .is("submission_deadline", null)
      .lt("publication_date", cutoffIso)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    candidates.push(...(data as unknown as Candidate[]));
    if (data.length < PAGE_SIZE) break;
  }

  if (dryRun || candidates.length === 0) {
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

  return NextResponse.json({ dryRun, cutoff: cutoffIso, deletedCount, failed });
}
