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
import { fetchPemexList } from "@/lib/ingestion/connectors/pemex-live";
import { mapPemexConcursoItemToTender } from "@/lib/ingestion/pemex-mapper";
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
  const mapped = items
    .map((item) => mapPemexConcursoItemToTender(item, buyer, SOURCE_NAME, listTitle, procedureLabel))
    .filter((t): t is Tender => t !== null);
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
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
