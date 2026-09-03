/**
 * One-off repair for PEMEX tenders written before pemex-mapper.ts's
 * sourceUrl fix (see DISPLAY_FORM_PATH_BY_LIST_TITLE there) — every row
 * ingested under the old guess has a 404ing sourceUrl
 * (".../concursosabiertos/DispForm.aspx?ID=<id>", the site root) instead
 * of the real per-list path
 * (".../concursosabiertos/Lists/ConcursosAbiertos<X>/DispForm.aspx?ID=<id>").
 * Confirmed real 2026-09-03: the user clicked "查看原始来源文件" on
 * pemex-snr-mad-140-ca-o-2026 and got PEMEX's own 404 page.
 *
 * The item's numeric SharePoint Id survives in the old sourceUrl's own
 * `?ID=` query param, so this only rewrites the path prefix — no need to
 * re-derive the Id from anywhere else. Which subsidiary list a row came
 * from isn't stored as its own column, so it's inferred from (buyer,
 * procedureType), the same two fields ingest-pemex.ts derives from
 * --buyer/--procedure-label per subsidiary (see README.md's real
 * subsidiary run table). One real ambiguity: "Concursos-Abiertos-PE"
 * (Corporate) and "Concursos-e-invitaciones" both use buyer "Petróleos
 * Mexicanos (PEMEX)" — disambiguated by procedureType, which embeds the
 * procedure label ("Concurso Abierto" vs "Invitación a Cuando Menos Tres
 * Personas").
 *
 * Usage:
 *   npm run fix:pemex-source-urls               (dry run — report only)
 *   npm run fix:pemex-source-urls -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const SOURCE_NAME = "PEMEX — Concursos Abiertos";
const PEMEX_SITE_ORIGIN = "https://www.pemex.com";

// Kept in sync by hand with DISPLAY_FORM_PATH_BY_LIST_TITLE in
// lib/ingestion/pemex-mapper.ts — not imported from there since this
// script keys off (buyer, procedureType), not listTitle directly.
const DISPLAY_FORM_PATH_BY_LIST_TITLE: Record<string, string> = {
  "Concursos-Abiertos-PEP": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPEP/DispForm.aspx",
  "Concursos-Abiertos-PTI": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPTI/DispForm.aspx",
  "Concursos-Abiertos-PL": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPL/DispForm.aspx",
  "Concursos-Abiertos-PE": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPE/DispForm.aspx",
  "Concursos-Abiertos-PF": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPF/DispForm.aspx",
  "Concursos-Abiertos-PPS": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/ConcursosAbiertosPPS/DispForm.aspx",
  "Concursos-e-invitaciones": "/procura/procedimientos-de-contratacion/concursosabiertos/Lists/Concursoseinvitaciones/DispForm.aspx",
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
  let noId = 0;
  let unrecognizedList = 0;
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

      const idMatch = oldSourceUrl.match(/[?&]ID=(\d+)/);
      if (!idMatch) {
        console.log(`  [skip] ${slug} — no ?ID= in stored sourceUrl: ${oldSourceUrl}`);
        noId++;
        continue;
      }

      const listTitle = inferListTitle(buyer, procedureType);
      const path = listTitle ? DISPLAY_FORM_PATH_BY_LIST_TITLE[listTitle] : undefined;
      if (!path) {
        console.log(`  [skip] ${slug} — buyer "${buyer}" doesn't match a known subsidiary list`);
        unrecognizedList++;
        continue;
      }

      const newSourceUrl = `${PEMEX_SITE_ORIGIN}${path}?ID=${idMatch[1]}`;
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

  console.log(
    `\n${fixed} fixable, ${alreadyRight} already correct, ${noId} skipped (no ?ID= found), ${unrecognizedList} skipped (unrecognized buyer).`,
  );
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
