/**
 * Metro de Santiago's announced tenders, against the real page captured
 * 2026-09-26 (lib/ingestion/__fixtures__/metro-santiago-proximas-2026-09-26.html).
 *
 * Usage: npm run test:metro-santiago
 */
import { readFileSync } from "node:fs";
import { parseMetroSantiagoPreviewPage, parsePlannedMonth } from "../lib/ingestion/connectors/metro-santiago-live";
import { mapMetroSantiagoPlannedTender, metroLineLabel } from "../lib/ingestion/metro-santiago-mapper";
import { deriveTenderStatus } from "../lib/tender-status";
import { METRO_SANTIAGO_PREVIEW_SOURCE_NAME } from "../lib/upcoming-tenders";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const rows = parseMetroSantiagoPreviewPage(readFileSync("lib/ingestion/__fixtures__/metro-santiago-proximas-2026-09-26.html", "utf8"));
check("every data row of the captured page parses", rows.length, 105);
check("every row carries a month", rows.filter((row) => !row.plannedMonth).length, 0);
check("month formats", [parsePlannedMonth("jun-26"), parsePlannedMonth("sept-2026"), parsePlannedMonth("Dic 26"), parsePlannedMonth("pronto")], ["2026-06", "2026-09", "2026-12", undefined]);
check("line labels", ["L9", "Línea 7", "L89", "L6EX EFE", "Operacionales"].map(metroLineLabel), ["Línea 9", "Línea 7", "Líneas 8 y 9", "Extensión Línea 6", "Operacionales"]);

const now = new Date("2026-09-26T12:00:00Z");
const kept = rows.map((row) => mapMetroSantiagoPlannedTender(row, now)).filter((tender) => tender !== null);
check("on 2026-09-26 the large upcoming items are the four L7/L9 rows", kept.map((tender) => `${tender.relevance.tier} ${tender.title.es.split(" — ")[0]}`), [
  "significant EMAS L9",
  "flagship Obras Civiles de Estaciones Grupos 3 y 4, Línea 7",
  "significant Suministro y mantenimiento sistema de Ticketing red de uso Línea 9",
  "flagship Obras Civiles de Estaciones Grupos 1 y 2, Línea 7",
]);
check("every kept row is planned, transport, in Chile", kept.every((tender) => tender.status === "planned" && tender.industries.includes("transportation") && tender.country === "Chile"), true);
check("the summary says it is an announcement and names the month", /aviso previo[\s\S]*junio de 2026/.test(kept[1].summary.es), true);
check("running-railway buying is not imported", rows.filter((row) => row.project === "Operacionales").map((row) => mapMetroSantiagoPlannedTender(row, now)).every((tender) => tender === null), true);
const study = { project: "L9", service: "Ing. Detalle Estaciones Tramo Sur (Extension sur)", plannedText: "oct-26", plannedMonth: "2026-10" };
check("a study on a new line is not imported", mapMetroSantiagoPlannedTender(study, now), null);
const old = { project: "L9", service: "Material Rodante y CBTC", plannedText: "ago-25", plannedMonth: "2025-08" };
check("a month more than three months gone is not imported", mapMetroSantiagoPlannedTender(old, now), null);
check("the same row inside the window is flagship", mapMetroSantiagoPlannedTender({ ...old, plannedMonth: "2026-07" }, now)?.relevance.tier, "flagship");

check("an announcement keeps 即将招标", deriveTenderStatus("planned", { sourceName: METRO_SANTIAGO_PREVIEW_SOURCE_NAME, publicationDate: "2026-01-01" }, now), "planned");
check("planned from any other source still reads 招标中 (rule 1)", deriveTenderStatus("planned", { sourceName: "Portal Nacional de Contratações Públicas (PNCP)" }, now), "open");
check("a cancelled announcement is cancelled", deriveTenderStatus("cancelled", { sourceName: METRO_SANTIAGO_PREVIEW_SOURCE_NAME }, now), "cancelled");

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
