/**
 * Core logic behind the admin "DOF 直接拉取" section
 * (app/admin/import-tenders/) — fetches DOF's advanced-search results
 * directly (lib/ingestion/connectors/dof-search-live.ts), no manual
 * DevTools "Copy as cURL" capture step at all, since the endpoint is
 * confirmed to carry only a routine `ci_session` cookie, not an anti-bot
 * gate (see dof-search-mapper.ts's header comment and README.md).
 *
 * Fetches each tender notice's own detail page the same way
 * scripts/ingest-dof-search.ts does (the search response alone is just a
 * bare "<BUYER> - REF:<number>" stub with no real content — see
 * lib/relevance.ts's BARE_BUYER_REF_TITLE), but with the CLI's
 * process.exit(1) circuit breaker converted into a thrown Error: this runs
 * inside a Next.js request handler, where exiting the process would kill
 * the whole dev server rather than just this one import run.
 */
import { fetchDofSearchLive } from "@/lib/ingestion/connectors/dof-search-live";
import { fetchDofNoticeDetail } from "@/lib/ingestion/connectors/dof-notice-detail";
import type { DofNoticeDetail } from "@/lib/ingestion/connectors/dof-notice-detail";
import { mapDofSearchNotaToTender, toDetailPageFecha } from "@/lib/ingestion/dof-search-mapper";
import type { DofSearchNota } from "@/lib/ingestion/dof-search-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Tender } from "@/types/tender";
import type { ImportDofSearchLiveResult } from "@/lib/ingestion/dof-sources";

export type { ImportDofSearchLiveResult } from "@/lib/ingestion/dof-sources";
export { DEFAULT_DOF_ID_ORG } from "@/lib/ingestion/dof-sources";

const SOURCE_NAME = "Diario Oficial de la Federación (DOF) — búsqueda avanzada";
const TENDER_SECTION = /CONVOCATORIAS PARA CONCURSOS/i;

// Same reasoning as scripts/ingest-dof-search.ts: a real systemic failure
// (network/firewall/DNS) should stop the run loudly instead of grinding
// through hundreds more doomed requests — but as a thrown Error here, not
// process.exit(1), since this runs inside a live web request.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * A few at a time, not one after another.
 *
 * A real CFE search for 13 days returns 33 notices, and fetching their detail
 * pages one by one took 30 seconds — long enough that the run is racing the
 * platform's own request limit rather than DOF (2026-09-14). Three at a time
 * is still gentle on a public page with no gate, and turns that into roughly
 * a third of the wall clock.
 *
 * Deliberately not higher: the point is to stop losing whole imports to the
 * clock, not to extract the last second out of a government website.
 */
const DETAIL_FETCH_CONCURRENCY = 3;

async function fetchDetailsForNotas(notas: DofSearchNota[]): Promise<Map<number, DofNoticeDetail>> {
  const details = new Map<number, DofNoticeDetail>();
  const tenderNotas = notas
    .filter((n) => n.titulo?.trim() && TENDER_SECTION.test(n.codOrgaUno ?? ""))
    .map((nota) => ({ nota, fecha: toDetailPageFecha(nota.fecha) }))
    .filter((entry): entry is { nota: DofSearchNota; fecha: string } => !!entry.fecha);

  let consecutiveErrors = 0;
  for (let i = 0; i < tenderNotas.length; i += DETAIL_FETCH_CONCURRENCY) {
    const batch = tenderNotas.slice(i, i + DETAIL_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((entry) => fetchDofNoticeDetail(entry.nota.codNota, entry.fecha)));

    // Walked in batch order so "in a row" keeps meaning what it meant when
    // this was sequential.
    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (result.status === "error") {
        consecutiveErrors++;
        if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
          throw new Error(
            `${consecutiveErrors} DOF detail-page fetches in a row failed with an error — this looks systemic (network reaching dof.gob.mx), not "these notices just don't have detail pages." Stopped early instead of grinding through the rest. Last error: ${result.message}`,
          );
        }
        continue;
      }
      consecutiveErrors = 0;
      if (result.status === "found") details.set(batch[j].nota.codNota, result.detail);
    }
  }

  return details;
}

/**
 * The requested date range, as a cutoff timestamp — the DOF search is asked
 * for `fechainicio`..`fechahasta`, so the window is already stated and asking
 * a second time for it in months was, as the user put it (2026-09-12),
 * meaningless: 毕竟都是选取上面的日期.
 *
 * Not simply deleted, because the filter was doing one real thing. A DOF
 * notice's own detail page can print a different publication date from the
 * one it was indexed under, and dof-search-mapper prefers the detail page's
 * (`detailPublicationDate ?? searchDate`) — so a notice returned for
 * September can still map to a tender dated years earlier. What is removed is
 * the SECOND knob: the window now comes from the dates actually requested, so
 * the two can no longer disagree, and a wider range than the months box could
 * no longer silently discard exactly the rows that were asked for.
 */
function cutoffFromRange(fechaIni: string): number | null {
  // dd-mm-yyyy, the format the DOF search itself takes.
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fechaIni.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export async function importDofSearchLive(
  params: { texto: string; fechaIni: string; fechaFin: string; idOrg?: string },
  options: { write: boolean },
): Promise<ImportDofSearchLiveResult> {
  const notas = await fetchDofSearchLive(params);
  const detailsByCodNota = await fetchDetailsForNotas(notas);

  const mapped = notas
    .map((n) => mapDofSearchNotaToTender(n, SOURCE_NAME, detailsByCodNota.get(n.codNota)))
    .filter((t): t is Tender => t !== null);

  const cutoff = cutoffFromRange(params.fechaIni);
  const kept = cutoff === null
    ? mapped
    : mapped.filter((tender) => new Date(tender.publicationDate).getTime() >= cutoff);

  const result: ImportDofSearchLiveResult = {
    totalNotas: notas.length,
    detailsFetched: detailsByCodNota.size,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
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
