import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Bulk version of the single-tender DELETE (app/api/admin/tenders/[slug]/
 * route.ts) — same two effects (delete the row, cascading to every child
 * table; tombstone the slug so a future re-ingest from the same source
 * doesn't silently resurrect it), just batched. Added per the user's
 * explicit request (2026-09-05): manually deleting dozens/hundreds of
 * already-awarded tenders one at a time from /admin/tenders was the real
 * pain point ("这些我都要人工删除了，对现阶段来说没有意义").
 *
 * Chunked at 200 slugs per Supabase call — this route can be handed the
 * entire filtered result of the admin list (e.g. every "已中标" tender
 * across every country), which can run into the hundreds; a single
 * `.in("slug", slugs)` call with an unbounded array is the kind of thing
 * that's fine until the one time it isn't.
 */
const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { slugs?: string[] };
  const slugs = Array.isArray(body.slugs) ? [...new Set(body.slugs.filter((s): s is string => typeof s === "string" && s.length > 0))] : [];
  if (slugs.length === 0) return NextResponse.json({ error: "slugs must be a non-empty array of strings" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  let deletedCount = 0;
  const failed: string[] = [];

  for (const slugChunk of chunk(slugs, CHUNK_SIZE)) {
    // Best-effort: read title/tender_number before deleting, same as the
    // single-tender route, purely so tender_manual_deletions carries a
    // human-readable record — nothing downstream depends on these being
    // present.
    const { data: aboutToDelete } = await supabase.from("tenders").select("slug, tender_number, title").in("slug", slugChunk);
    const aboutToDeleteBySlug = new Map((aboutToDelete ?? []).map((row) => [row.slug as string, row]));

    const { error } = await supabase.from("tenders").delete().in("slug", slugChunk);
    if (error) {
      console.error(`Bulk delete failed for chunk starting at "${slugChunk[0]}": ${error.message}`);
      failed.push(...slugChunk);
      continue;
    }
    deletedCount += slugChunk.length;

    const tombstoneRows = slugChunk.map((slug) => {
      const row = aboutToDeleteBySlug.get(slug);
      const title = row?.title as { es?: string } | undefined;
      return { slug, tender_number: row?.tender_number ?? null, title: title?.es ?? null, deleted_at: new Date().toISOString() };
    });
    const { error: tombstoneError } = await supabase.from("tender_manual_deletions").upsert(tombstoneRows, { onConflict: "slug" });
    if (tombstoneError) console.error(`Failed to record tender_manual_deletions for a bulk-delete chunk: ${tombstoneError.message}`);
  }

  if (failed.length > 0 && deletedCount === 0) {
    return NextResponse.json({ error: "bulk delete failed", failed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedCount, failed });
}
