/**
 * One-off repair for PEMEX tenders written before pemex-mapper.ts's
 * sourceUrl fix — every row ingested under the old guesses has a broken
 * or login-gated sourceUrl (see SEARCH_PAGE_PATH_BY_LIST_TITLE's header
 * comment in lib/ingestion/pemex-mapper.ts for the two dead ends already
 * ruled out: a hardcoded site-root DispForm.aspx guess that 404'd, then a
 * per-list DispForm.aspx that redirected to a real PEMEX login form).
 * Confirmed real 2026-09-03: the user clicked "查看原始来源文件" on
 * pemex-snr-mad-140-ca-o-2026 and got PEMEX's own 404 page.
 *
 * The fix here is the same one now baked into pemex-mapper.ts: point
 * sourceUrl at each subsidiary's real, anonymously-reachable search page
 * under `Paginas/` instead of any per-item link (none exists anonymously
 * on this site). Which subsidiary list a row came from isn't stored as
 * its own column, so it's inferred from (buyer, procedureType) — the same
 * two fields ingest-pemex.ts derives from --buyer/--procedure-label per
 * subsidiary (see README.md's real subsidiary run table). One real
 * ambiguity: "Concursos-Abiertos-PE" (Corporate) and
 * "Concursos-e-invitaciones" both use buyer "Petróleos Mexicanos
 * (PEMEX)" — disambiguated by procedureType, which embeds the procedure
 * label ("Concurso Abierto" vs "Invitación a Cuando Menos Tres Personas").
 *
 * Usage:
 *   npm run fix:pemex-source-urls               (dry run — report only)
 *   npm run fix:pemex-source-urls -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const SOURCE_NAME = "PEMEX — Concursos Abiertos";
const PEMEX_SITE_ORIGIN = "https://www.pemex.com";
const CONCURSOS_ROOT_PATH = "/procura/procedimientos-de-contratacion/concursosabiertos";

// Kept in sync by hand with SEARCH_PAGE_PATH_BY_LIST_TITLE in
// lib/ingestion/pemex-mapper.ts — not imported from there since this
// script keys off (buyer, procedureType), not listTitle directly.
const SEARCH_PAGE_PATH_BY_LIST_TITLE: Record<string, string> = {
  "Concursos-Abiertos-PEP": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Exploración-y-Producción.aspx`,
  "Concursos-Abiertos-PTI": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Transformación-Industrial.aspx`,
  "Concursos-Abiertos-PL": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Logística.aspx`,
  "Concursos-Abiertos-PE": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex.aspx`,
  "Concursos-Abiertos-PF": CONCURSOS_ROOT_PATH,
  "Concursos-Abiertos-PPS": CONCURSOS_ROOT_PATH,
  "Concursos-e-invitaciones": CONCURSOS_ROOT_PATH,
};

function inferListTitle(buyer: string, procedureType: string | null): string | undefined {
  switch (buyer) {
    case "Pemex Exploración y Producción":
      return "Concursos-Abiertos-PEP";
    case "Pemex Transformación Industrial":
      return "Concursos-Abiertos-PTI";
    case "Pemex Logística":
      return "Concursos-Abiertos-PL";
    case "Pemex Fertilizantes":
      return "Concursos-Abiertos-PF";
    case "Pemex Perforación y Servicios":
      return "Concursos-Abiertos-PPS";
    case "Petróleos Mexicanos (PEMEX)":
      return procedureType?.startsWith("Invitación a Cuando Menos Tres Personas")
        ? "Concursos-e-invitaciones"
        : "Concursos-Abiertos-PE";
    default:
      return undefined;
  }
}

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const PAGE_SIZE = 1000;
  let fixed = 0;
  let unrecognizedBuyer = 0;
  let alreadyRight = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows, error } = await supabase
      .from("tenders")
      .select("slug, buyer, procedure_type, source_url")
      .eq("source_name", SOURCE_NAME)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Failed to query tenders: ${error.message}`);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const slug = row.slug as string;
      const buyer = row.buyer as string;
      const procedureType = row.procedure_type as string | null;
      const oldSourceUrl = row.source_url as string;

      const listTitle = inferListTitle(buyer, procedureType);
      if (!listTitle) {
        console.log(`  [skip] ${slug} — buyer "${buyer}" doesn't match a known subsidiary list`);
        unrecognizedBuyer++;
        continue;
      }

      const newSourceUrl = `${PEMEX_SITE_ORIGIN}${SEARCH_PAGE_PATH_BY_LIST_TITLE[listTitle]}`;
      if (newSourceUrl === oldSourceUrl) {
        alreadyRight++;
        continue;
      }

      fixed++;
      if (shouldWrite) {
        const { error: updateError } = await supabase.from("tenders").update({ source_url: newSourceUrl }).eq("slug", slug);
        if (updateError) console.error(`    failed to write ${slug}: ${updateError.message}`);
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`\n${fixed} fixable, ${alreadyRight} already correct, ${unrecognizedBuyer} skipped (unrecognized buyer).`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
