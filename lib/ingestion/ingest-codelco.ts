/**
 * Codelco public-call ingestion, shared by the daily cron and any later admin
 * button. One page read (connectors/codelco-live.ts); only calls still open
 * for interest are mapped.
 *
 * An empty table is reported — the page has never been empty, it keeps even
 * 2011 rows. No OPEN call is normal: on 2026-09-25 the newest had closed for
 * interest on 16 July.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCodelcoCalls, type CodelcoCall } from "@/lib/ingestion/connectors/codelco-live";
import { codelcoDocumentLinks, mapCodelcoCallToTender, CODELCO_SOURCE_NAME } from "@/lib/ingestion/codelco-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import type { Tender } from "@/types/tender";

export { CODELCO_SOURCE_NAME };

/** Today in Santiago, YYYY-MM-DD. */
export function santiagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type CodelcoIngestResult = {
  listedCount: number;
  open: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

export async function ingestCodelco(
  supabase: SupabaseClient | null,
  options: { write: boolean; calls?: CodelcoCall[]; now?: Date },
): Promise<CodelcoIngestResult> {
  const now = options.now ?? new Date();
  const calls = options.calls ?? (await fetchCodelcoCalls());
  const today = santiagoToday(now);

  const open: Tender[] = [];
  const callBySlug = new Map<string, CodelcoCall>();
  for (const call of calls) {
    const tender = mapCodelcoCallToTender(call, today, now);
    if (!tender) continue;
    open.push(tender);
    callBySlug.set(tender.slug, call);
  }

  const result: CodelcoIngestResult = {
    listedCount: calls.length,
    open,
    staleWarning: calls.length === 0 ? "⚠ Codelco「Licitaciones en proceso」表格一行都没解析出来。2026-09-25 实测有 51 行，更可能是页面结构变了，见 codelco-live.ts。" : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, open);
  await saveDocumentLinks(
    supabase,
    open.map((tender) => ({ slug: tender.slug, links: codelcoDocumentLinks(callBySlug.get(tender.slug)!, tender.publicationDate) })),
  );
  return { ...result, upsertedCount, failed };
}
