/**
 * Core logic behind the admin "PEMEX 直接拉取" section
 * (app/admin/import-tenders/) — fetches a PEMEX subsidiary's real
 * SharePoint "Concursos Abiertos" list directly (lib/ingestion/
 * connectors/pemex-live.ts), no manual browser-Console capture step at
 * all, since that API is confirmed genuinely anonymous with no anti-bot
 * gate (see pemex-mapper.ts's header comment). Reuses the same mapper
 * and write path (upsertTendersBatched) `npm run ingest:pemex` uses for
 * a locally-saved capture — this is a second, live entry point onto the
 * same data, not a replacement for that script (which still matters for
 * ingesting an export the file capture already happened for).
 */
import { fetchPemexAttachments, fetchPemexList } from "@/lib/ingestion/connectors/pemex-live";
import { mapPemexConcursoItemToTender, pemexDocumentLinks } from "@/lib/ingestion/pemex-mapper";
import { saveDocumentLinks, type DocumentLinksForSlug } from "@/lib/ingestion/document-links";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Tender } from "@/types/tender";
import type { ImportPemexLiveResult } from "@/lib/ingestion/pemex-sources";

export type { PemexListTitle, ImportPemexLiveResult } from "@/lib/ingestion/pemex-sources";
export { PEMEX_LIST_TITLES } from "@/lib/ingestion/pemex-sources";

const SOURCE_NAME = "PEMEX — Concursos Abiertos";

export async function importPemexLive(
  listTitle: string,
  buyer: string,
  options: { write: boolean; months?: number; procedureLabel?: string },
): Promise<ImportPemexLiveResult> {
  const months = options.months ?? 6;
  const procedureLabel = options.procedureLabel ?? "Concurso Abierto";

  const items = await fetchPemexList(listTitle);
  // Paired so the attachment pass below knows which SharePoint item id each
  // kept tender came from — the tender itself carries the procedure number,
  // not the list item id.
  const itemBySlug = new Map<string, number>();
  const mapped: Tender[] = [];
  for (const item of items) {
    const tender = mapPemexConcursoItemToTender(item, buyer, SOURCE_NAME, listTitle, procedureLabel);
    if (!tender) continue;
    if (item.Attachments) itemBySlug.set(tender.slug, item.Id);
    mapped.push(tender);
  }
  const kept = filterRecentTenders(mapped, months);

  const result: ImportPemexLiveResult = {
    listTitle,
    totalItems: items.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    months,
    sample: kept.slice(0, 5),
  };

  if (!options.write) return result;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);

  // AFTER the upsert, like Peru's: an excluded row is never written, so it has
  // no id to hang a link on.
  const documentLinks = await collectDocumentLinks(
    supabase,
    listTitle,
    kept.filter((tender) => itemBySlug.has(tender.slug)).map((tender) => ({ slug: tender.slug, itemId: itemBySlug.get(tender.slug)! })),
  );

  return { ...result, upsertedCount, skippedExcludedCount, failed, documentLinks };
}

/** One request per item, a few at a time — PEMEX's SharePoint has no bulk attachments endpoint and this runs over a month's worth of kept rows, not the whole 2,000-item list. */
const ATTACHMENT_CONCURRENCY = 4;

/**
 * Never throws. The tenders are already written by the time this runs, and a
 * links pass that fails is a missing convenience, not a failed import — the
 * count of items that failed is reported instead so a systemic outage is still
 * visible rather than silent.
 */
async function collectDocumentLinks(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  listTitle: string,
  targets: { slug: string; itemId: number }[],
): Promise<{ tenders: number; links: number; failedItems: number }> {
  if (!supabase || targets.length === 0) return { tenders: 0, links: 0, failedItems: 0 };

  const collected: DocumentLinksForSlug[] = [];
  let failedItems = 0;

  for (let from = 0; from < targets.length; from += ATTACHMENT_CONCURRENCY) {
    const batch = targets.slice(from, from + ATTACHMENT_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ slug, itemId }) => {
        try {
          const links = pemexDocumentLinks(await fetchPemexAttachments(listTitle, itemId));
          if (links.length > 0) collected.push({ slug, links });
        } catch {
          failedItems += 1;
        }
      }),
    );
  }

  if (collected.length === 0) return { tenders: 0, links: 0, failedItems };

  try {
    const saved = await saveDocumentLinks(supabase, collected);
    return { tenders: saved.tendersWithLinks, links: saved.linkCount, failedItems };
  } catch {
    return { tenders: 0, links: 0, failedItems: failedItems + collected.length };
  }
}
