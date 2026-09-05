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
import { filterRecentTenders } from "@/lib/ingestion/recency";
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

async function fetchDetailsForNotas(notas: DofSearchNota[]): Promise<Map<number, DofNoticeDetail>> {
  const details = new Map<number, DofNoticeDetail>();
  const tenderNotas = notas.filter((n) => n.titulo?.trim() && TENDER_SECTION.test(n.codOrgaUno ?? ""));

  let consecutiveErrors = 0;
  for (const nota of tenderNotas) {
    const fecha = toDetailPageFecha(nota.fecha);
    if (!fecha) continue;

    const result = await fetchDofNoticeDetail(nota.codNota, fecha);

    if (result.status === "error") {
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        throw new Error(
          `${consecutiveErrors} DOF detail-page fetches in a row failed with an error — this looks systemic (network reaching dof.gob.mx), not "these notices just don't have detail pages." Stopped early instead of grinding through the rest.`,
        );
      }
      continue;
    }
    consecutiveErrors = 0;

    if (result.status === "found") details.set(nota.codNota, result.detail);
  }

  return details;
}

export async function importDofSearchLive(
  params: { texto: string; fechaIni: string; fechaFin: string; idOrg?: string },
  options: { write: boolean; months?: number },
): Promise<ImportDofSearchLiveResult> {
  const months = options.months ?? 6;

  const notas = await fetchDofSearchLive(params);
  const detailsByCodNota = await fetchDetailsForNotas(notas);

  const mapped = notas
    .map((n) => mapDofSearchNotaToTender(n, SOURCE_NAME, detailsByCodNota.get(n.codNota)))
    .filter((t): t is Tender => t !== null);
  const kept = filterRecentTenders(mapped, months);

  const result: ImportDofSearchLiveResult = {
    totalNotas: notas.length,
    detailsFetched: detailsByCodNota.size,
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
