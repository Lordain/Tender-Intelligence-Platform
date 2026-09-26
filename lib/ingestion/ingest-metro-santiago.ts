/**
 * Metro de Santiago's announced tenders, shared by the daily cron and any
 * later admin button. One page read (connectors/metro-santiago-live.ts); the
 * mapper keeps the large, still-upcoming line-building items.
 *
 * An announcement is only true while the buyer is still making it. Once a
 * row leaves the programme — tendered, dropped, or aged past the grace
 * window — the platform's preview of it would go on saying 即将招标 about
 * something that is no longer coming, so a written run deletes the previews
 * it no longer produces. Only rows of this source are touched, and only when
 * the page parsed: an empty or broken read deletes nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMetroSantiagoPreview, type MetroSantiagoPlannedTender } from "@/lib/ingestion/connectors/metro-santiago-live";
import { mapMetroSantiagoPlannedTender, METRO_SANTIAGO_PREVIEW_SOURCE_NAME } from "@/lib/ingestion/metro-santiago-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender } from "@/types/tender";

export { METRO_SANTIAGO_PREVIEW_SOURCE_NAME };

export type MetroSantiagoIngestResult = {
  listedCount: number;
  upcoming: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  /** Previews removed because the programme no longer announces them. */
  removedSlugs?: string[];
};

export async function ingestMetroSantiago(
  supabase: SupabaseClient | null,
  options: { write: boolean; rows?: MetroSantiagoPlannedTender[]; now?: Date },
): Promise<MetroSantiagoIngestResult> {
  const now = options.now ?? new Date();
  const rows = options.rows ?? (await fetchMetroSantiagoPreview());
  // Two programme rows can name the same item (the table repeats some under
  // "L7" and "Línea 7"); one slug, one preview.
  const bySlug = new Map<string, Tender>();
  for (const row of rows) {
    const tender = mapMetroSantiagoPlannedTender(row, now);
    if (tender && !bySlug.has(tender.slug)) bySlug.set(tender.slug, tender);
  }
  const upcoming = [...bySlug.values()];

  const result: MetroSantiagoIngestResult = {
    listedCount: rows.length,
    upcoming,
    staleWarning: rows.length === 0 ? "⚠ 圣地亚哥地铁「Próximas Licitaciones」表格一行都没解析出来。2026-09-26 实测有 105 行，更可能是页面结构变了，见 metro-santiago-live.ts。" : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, upcoming);

  let removedSlugs: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase.from("tenders").select("slug").eq("source_name", METRO_SANTIAGO_PREVIEW_SOURCE_NAME);
    if (error) throw new Error(`读取圣地亚哥地铁预告失败：${error.message}`);
    removedSlugs = (data ?? []).map((row: { slug: string }) => row.slug).filter((slug) => !bySlug.has(slug));
    if (removedSlugs.length > 0) {
      const { error: deleteError } = await supabase.from("tenders").delete().eq("source_name", METRO_SANTIAGO_PREVIEW_SOURCE_NAME).in("slug", removedSlugs);
      if (deleteError) throw new Error(`删除过期预告失败：${deleteError.message}`);
    }
  }
  return { ...result, upsertedCount, failed, removedSlugs };
}
