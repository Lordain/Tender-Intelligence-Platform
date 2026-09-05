/**
 * Ingests a locally-saved DOF advanced-search response — the endpoint
 * that finally confirmed CFE tenders publish in DOF under a real,
 * identifiable section (see lib/ingestion/dof-search-mapper.ts).
 *
 * For every tender-section notice, also fetches its own detail page
 * (dof-notice-detail.ts, confirmed not anti-bot gated, 2026-09-03) before
 * mapping — the search response alone only ever carries "<BUYER> -
 * REF:<number>" with zero real content (see lib/relevance.ts's
 * BARE_BUYER_REF_TITLE), while the detail page has the real procedure
 * number, title, and key-dates table. A notice whose detail page doesn't
 * parse (a different table shape — confirmed real for CFE only so far,
 * see dof-notice-detail.ts) still maps from the bare stub exactly as
 * before, so this can only add real content, never lose a row that would
 * have ingested otherwise.
 *
 * Usage:
 *   npm run ingest:dof-search -- --fixture
 *   npm run ingest:dof-search -- path/to/response.json [--write]
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readDofSearchFile } from "../lib/ingestion/connectors/dof-search-file";
import { mapDofSearchNotaToTender, toDetailPageFecha } from "../lib/ingestion/dof-search-mapper";
import { fetchDofNoticeDetail } from "../lib/ingestion/connectors/dof-notice-detail";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";
import type { DofSearchNota } from "../lib/ingestion/dof-search-mapper";
import type { DofNoticeDetail } from "../lib/ingestion/connectors/dof-notice-detail";

// Same reasoning as resolve-comprasmx-links.ts / discover-comprasmx-vigente.ts:
// a real systemic failure (network/firewall/DNS) should stop the run
// loudly instead of grinding through hundreds more doomed requests.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

const TENDER_SECTION = /CONVOCATORIAS PARA CONCURSOS/i;

async function fetchDetailsForNotas(notas: DofSearchNota[]): Promise<Map<number, DofNoticeDetail>> {
  const details = new Map<number, DofNoticeDetail>();
  const tenderNotas = notas.filter((n) => n.titulo?.trim() && TENDER_SECTION.test(n.codOrgaUno ?? ""));

  let consecutiveErrors = 0;
  for (const [i, nota] of tenderNotas.entries()) {
    const fecha = toDetailPageFecha(nota.fecha);
    if (!fecha) continue;

    const result = await fetchDofNoticeDetail(nota.codNota, fecha);

    if (result.status === "error") {
      console.error(`  [${i + 1}/${tenderNotas.length}] error fetching detail for codNota ${nota.codNota} — ${result.message}`);
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        console.error(
          `\n${consecutiveErrors} detail fetches in a row failed with an error — stopping early. This looks systemic (network/firewall/DNS reaching dof.gob.mx), not "these notices don't have detail pages." Fix that first, then re-run.`,
        );
        process.exit(1);
      }
      continue;
    }
    consecutiveErrors = 0;

    if (result.status === "found") details.set(nota.codNota, result.detail);
  }

  console.log(`Fetched real detail-page content for ${details.size} of ${tenderNotas.length} tender notice(s).`);
  return details;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Diario Oficial de la Federación (DOF) — búsqueda avanzada";

async function upsertTenders(tenders: Tender[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, tenders, (done, total) => {
    console.log(`Upserted ${done}/${total}...`);
  });
  if (failed.length > 0) {
    console.error(`${failed.length} row(s) failed to upsert:`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${upsertedCount} of ${tenders.length} mapped tenders.`);
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:dof-search -- <response.json> [--write]");
    console.error("   or: npm run ingest:dof-search -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-dof-search.json")
    : filePath!;

  const notas = readDofSearchFile(resolvedPath);

  // --fixture stays fully offline (per this project's "verified working
  // offline, no network needed" posture) — real network fetches only
  // happen against a real, user-provided search response.
  const detailsByCodNota: Map<number, DofNoticeDetail> = useFixture ? new Map() : await fetchDetailsForNotas(notas);

  const mappedTenders = notas
    .map((n) => mapDofSearchNotaToTender(n, SOURCE_NAME, detailsByCodNota.get(n.codNota)))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${mappedTenders.length} tender notice(s) of ${notas.length} notices in this response.`);

  const tenders = filterRecentTenders(mappedTenders, months);
  if (tenders.length !== mappedTenders.length) {
    console.log(
      `Keeping ${tenders.length} of ${mappedTenders.length} published within the last ${months} month(s) (pass --months 0 to disable).`,
    );
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
