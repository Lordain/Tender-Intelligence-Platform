/**
 * Guatemala (Guatecompras paste, staged 2026-10-16, user's rule A): reading
 * the 「Concursos vigentes」 list and 「Detalle de concurso」 pages as the admin
 * pasted them on 2026-10-16, the modality reach, rule A (no local
 * governments), the no-amount cap, the link capture, the stored-field round
 * trip and the staged-country gate. Offline.
 */
import { readFileSync } from "node:fs";
import { guatecomprasDate, isGuatemalaLocalGovernment, isReadGuatemalaModality, parseGuatecomprasDetails, parseGuatecomprasList } from "../lib/ingestion/guatemala-paste";
import { extractGuatecomprasLinks, guatecomprasCallUrl } from "../lib/ingestion/guatemala-paste-result";
import { guatemalaCallFromList, guatemalaScopeType, mapGuatemalaCallToTender } from "../lib/ingestion/guatemala-mapper";
import { importGuatemalaDetails, screenGuatemalaList } from "../lib/ingestion/import-guatemala-paste";
import { classifyStoredTender } from "../lib/relevance";
import { isStagedCountry } from "../lib/staged-countries";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const fixture = (name: string) => readFileSync(`lib/ingestion/__fixtures__/guatemala/${name}`, "utf8");
const local = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Guatemala" }).slice(0, 16) : null);
const now = new Date("2026-10-16T15:00:00Z");

async function main() {
  // --- Dates ---------------------------------------------------------------
  check("List day 「16.oct..2026」, end of day", local(guatecomprasDate("16.oct..2026")), "2026-10-16 23:59");
  check("List publication day at noon", local(guatecomprasDate("14.oct..2026", "noon")), "2026-10-14 12:00");
  check("Detail 「25.noviembre.2026 10:00:00 a.m.」", local(guatecomprasDate("25.noviembre.2026 10:00:00 a.m.")), "2026-11-25 10:00");
  check("Detail 「15.octubre.2026 07:04:48 p.m.」", local(guatecomprasDate("15.octubre.2026 07:04:48 p.m.")), "2026-10-15 19:04");
  check("12 p.m. is noon", local(guatecomprasDate("1.diciembre.2026 12:30:00 p.m.")), "2026-12-01 12:30");

  // --- The list ------------------------------------------------------------
  const all = parseGuatecomprasList(fixture("vigentes-todas-2026-10-16.txt"));
  const lic = parseGuatecomprasList(fixture("vigentes-licitacion-2026-10-16.txt"));
  check("Every modality, 50 calls read", all.length, 50);
  check("Licitación Pública filter, 50 calls read", lic.length, 50);
  check("Only one Licitación in the unfiltered page", all.filter((call) => isReadGuatemalaModality(call.modality)).length, 1);
  const tractors = lic.find((call) => call.nog === "31330665")!;
  check("Entity", tractors.entity, "MINISTERIO DE COMUNICACIONES, INFRAESTRUCTURA Y VIVIENDA");
  check("Unit", tractors.unit, "DIRECCION GENERAL DE AERONAUTICA CIVIL");
  check("Description", tractors.description.startsWith("ADQUISICIÓN DE TRACTORES Y CHAPEADORAS"), true);
  check("Offers until", local(tractors.offersUntilDay), "2026-11-26 23:59");
  const wrapped = all.find((call) => call.nog === "32394454")!;
  check("A description on two lines is joined", wrapped.description.endsWith("Perfusor; 0."), true);
  check("Modality line", wrapped.modality, "Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)");

  // --- Reach and rule A ----------------------------------------------------
  check("Licitación Pública read", isReadGuatemalaModality("Licitación Pública (Art. 17 LCE)"), true);
  check("International agreements read", isReadGuatemalaModality("Convenios y Tratados Internacionales (Art. 1 LCE)"), true);
  check("Leases by Licitación not read", isReadGuatemalaModality("Arrendamientos por Licitación Pública(Art.43 inciso d )"), false);
  check("Compra Directa not read", isReadGuatemalaModality("Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)"), false);
  check("A municipality by name", isGuatemalaLocalGovernment("MUNICIPALIDAD DE NEBAJ, QUICHÉ"), true);
  check("A ministry by name", isGuatemalaLocalGovernment("MINISTERIO DE COMUNICACIONES, INFRAESTRUCTURA Y VIVIENDA"), false);
  check("The detail page's kind decides", isGuatemalaLocalGovernment("ANY", "Gobiernos Locales (Municipalidades, Mancomunidades, etc.)"), true);

  const screened = await screenGuatemalaList(null, fixture("vigentes-licitacion-2026-10-16.txt"), [], now);
  check("48 local-government calls excluded", screened.rows.filter((row) => row.municipal && row.outcome === "excluded").length, 48);
  check("Worth opening: the DGAC tractors", screened.rows.filter((row) => row.outcome === "write").map((row) => row.nog), ["31330665"]);
  check("No amount: at most 常规", screened.rows.find((row) => row.nog === "31330665")?.tier, "standard");
  check("Records digitisation: no key industry, no amount → excluded", screened.rows.find((row) => row.nog === "30292433")?.outcome, "excluded");
  const unfiltered = await screenGuatemalaList(null, fixture("vigentes-todas-2026-10-16.txt"), [], now);
  check("Unfiltered page: 49 outside the reach, counted by modality", unfiltered.notRead.reduce((sum, entry) => sum + entry.count, 0), 49);

  // --- Detail pages --------------------------------------------------------
  const details = parseGuatecomprasDetails(fixture("detalles-2026-10-16.txt"));
  check("Two detail pages", details.map((detail) => detail.nog), ["32390475", "32175833"]);
  const chicacao = details[1];
  check("Offers due: the earlier of presentación and cierre", local(chicacao.offersUntil), "2026-11-25 10:00");
  check("Published with its hour", local(chicacao.publishedAt), "2026-10-15 19:04");
  check("Bonds", [chicacao.bondBidPercent, chicacao.bondPerformancePercent], [1, 10]);
  check("SNIP", [details[0].snip, chicacao.snip], [false, true]);
  check("Entity kind", chicacao.entityKind, "Gobiernos Locales (Municipalidades, Mancomunidades, etc.)");
  const imported = await importGuatemalaDetails(null, [{ text: fixture("detalles-2026-10-16.txt"), links: [] }], { write: false, now });
  check("Compra Directa page: outside the reach", [imported.rows[0].outcome, imported.rows[0].tier], ["excluded", "excluded"]);
  check("Chicacao: local government, excluded", imported.rows[1].reasonZh.startsWith("地方政府"), true);
  const kept = await importGuatemalaDetails(null, [{ text: fixture("detalles-2026-10-16.txt"), links: [] }], { write: false, now, keep: { "32175833": "standard" } });
  check("Kept by hand", kept.rows[1].outcome, "manual_keep");

  // --- Links ---------------------------------------------------------------
  const html = '<a href="consultaConcurso.aspx?nog=31330665&amp;o=5">31330665</a><a href="https://example.com/x?nog=1234567">x</a>';
  check("Link from the copied HTML, made absolute", extractGuatecomprasLinks(html), [{ nog: "31330665", url: "https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=31330665&o=5" }]);
  check("Fallback address", guatecomprasCallUrl("31330665"), "https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=31330665");

  // --- Scope, round trip, staging -------------------------------------------
  check("Scope: MEJORAMIENTO is works", guatemalaScopeType("MEJORAMIENTO CAMINO RURAL"), "works");
  check("Scope: ADQUISICIÓN is equipment", guatemalaScopeType("ADQUISICIÓN DE TRACTORES"), "equipment");
  for (const call of lic.slice(0, 12).concat(tractors)) {
    const tender = mapGuatemalaCallToTender(guatemalaCallFromList(call), now);
    const again = classifyStoredTender({
      title: tender.title.es,
      summary: tender.summary.es,
      buyer: tender.buyer,
      country: tender.country,
      governmentLevel: tender.governmentLevel,
      scopeType: tender.scopeType,
      procedureType: tender.procedureType,
      tenderNumber: tender.tenderNumber,
      sourceName: tender.sourceName,
    });
    check(`Round trip NOG ${call.nog}`, again.relevance.tier, tender.relevance.tier);
  }
  check("Guatemala is staged", isStagedCountry("Guatemala"), true);
  check("No email address in the fixtures", ["vigentes-todas-2026-10-16.txt", "vigentes-licitacion-2026-10-16.txt", "detalles-2026-10-16.txt"].some((name) => /@/.test(fixture(name))), false);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
