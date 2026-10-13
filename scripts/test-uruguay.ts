/** Offline checks for the Uruguay ARCE connector, mapper and the no-amount cap (lib/relevance.ts applyNoAmountCap). */
import { arceFeedDate, isIngestedArceTender, parseArceRss, type ArceRelease } from "../lib/ingestion/connectors/uruguay-arce-live";
import { mapArceReleaseToTender, uruguayGovernmentLevel, uruguayTime } from "../lib/ingestion/uruguay-mapper";
import { classifyStoredTender } from "../lib/relevance";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${String(expected)}, got ${String(actual)}`}`);
}

// Feed parsing and its zone-less dates (Montevideo, UTC-3).
const rss = `<rss><channel>
<item><title>id_compra:1378894,release_id:llamado-1378894,ocid:ocds-yfs5dr-1378894</title><guid>llamado-1378894</guid><category>tender</category><pubDate>Tue, 13 Oct 2026 10:25:12</pubDate></item>
<item><title>id_compra:1378001,release_id:adjudicacion-1378001</title><category>award</category><pubDate>Tue, 13 Oct 2026 11:00:00</pubDate></item>
</channel></rss>`;
const items = parseArceRss(rss);
check("RSS: two items", items.length, 2);
check("RSS: release id", items[0]?.releaseId, "llamado-1378894");
check("RSS: purchase id", items[0]?.purchaseId, "1378894");
check("RSS: category", items[1]?.category, "award");
check("feed date read as -03:00", arceFeedDate("Tue, 13 Oct 2026 10:25:12")?.toISOString(), "2026-10-13T13:25:12.000Z");
check("release time 'Z' read as -03:00", uruguayTime("2026-11-04T10:00:00Z"), "2026-11-04T13:00:00.000Z");

// What is read.
const release = (method: string, buyer: { id?: string; name?: string }, extra: Partial<NonNullable<ArceRelease["tender"]>> = {}): ArceRelease => ({
  ocid: "ocds-yfs5dr-1",
  id: "llamado-1",
  date: "2026-10-13T10:00:00Z",
  buyer,
  tender: { id: "1", title: `${method} 16/2026`, procurementMethodDetails: method, description: "Suministro de transformadores de potencia", ...extra },
});
check("Licitación Pública, any buyer → read", isIngestedArceTender(release("Licitación Pública", { id: "29-4", name: "ASSE" })), true);
check("Licitación Abreviada, UTE → read", isIngestedArceTender(release("Licitación Abreviada", { id: "61-1", name: "UTE" })), true);
check("Licitación Abreviada, MTOP Vialidad → read", isIngestedArceTender(release("Licitación Abreviada", { id: "10-3", name: "Dirección Nacional de Vialidad" })), true);
check("Licitación Abreviada, ANP by name → read", isIngestedArceTender(release("Licitación Abreviada", { id: "99-9", name: "Administración Nacional de Puertos" })), true);
check("Licitación Abreviada, ANTEL → not read", isIngestedArceTender(release("Licitación Abreviada", { id: "65-1", name: "ANTEL" })), false);
check("Compra Directa, UTE → not read", isIngestedArceTender(release("Compra Directa", { id: "61-1", name: "UTE" })), false);
check("Concurso de Precios → not read", isIngestedArceTender(release("Concurso de Precios", { id: "61-1", name: "UTE" })), false);

// Mapping.
check("UTE is a public company", uruguayGovernmentLevel("61-1", "UTE"), "public_company");
check("Intendencia is municipal", uruguayGovernmentLevel("84-1", "Intendencia de Montevideo"), "municipal");
const mapped = mapArceReleaseToTender(
  release("Licitación Pública", { id: "61-1", name: "UTE" }, { tenderPeriod: { startDate: "2026-10-13T09:00:00Z", endDate: "2026-11-20T15:30:00Z" } }),
  new Date("2026-10-13T15:00:00Z"),
);
check("slug", mapped.slug, "uruguay-1");
check("tender number", mapped.tenderNumber, "Licitación Pública 16/2026 (ID 1)");
check("title is the description", mapped.title.es, "Suministro de transformadores de potencia");
check("deadline in UTC", mapped.submissionDeadline, "2026-11-20T18:30:00.000Z");
check("open before the deadline", mapped.status, "open");
check("source page", mapped.sourceUrl, "https://www.comprasestatales.gub.uy/consultas/detalle/id/1");
check("no amount", mapped.estimatedValue, undefined);

// No amount → at most 常规, even when the 一句话总结 gives a long contract term.
const base = {
  title: "Construcción de la línea de transmisión de 500 kV",
  summary: "Construcción de la línea de transmisión de 500 kV.",
  buyer: "UTE",
  governmentLevel: "public_company" as const,
  scopeType: "works" as const,
  procedureType: "Licitación Pública",
  tenderNumber: "LP 1/2026",
  sourceName: "test",
  oneLineSummary: "为UTE建设500千伏输电线路，合同期48个月",
};
check("Uruguay, no amount, 4-year term → 常规", classifyStoredTender({ ...base, country: "Uruguay" }).relevance.tier, "standard");
check("Paraguay, same row → 大型 (cap is Uruguay only)", classifyStoredTender({ ...base, country: "Paraguay" }).relevance.tier, "flagship");
check(
  "Uruguay with an amount → not capped",
  classifyStoredTender({ ...base, country: "Uruguay", estimatedValue: 80_000_000, currency: "USD" }).relevance.tier,
  "flagship",
);

// No amount is not a keep signal on its own (as Mexico, Peru, Chile, Argentina),
// with the open-call truck fleet kept (user, 2026-10-13: 这个留).
const live = (title: string, procedureType = "Licitación Pública", summary = title) =>
  classifyStoredTender({ title, summary, buyer: "Intendencia de Rocha", country: "Uruguay", governmentLevel: "municipal", scopeType: "unknown", procedureType, tenderNumber: "LP 10/2026", sourceName: "test" })
    .relevance.tier;
check("school catering in Río Negro → excluded", live("SERVICIO DE ALIMENTACIÓN TERCERIZADO PARA EL LICEO N°2 DE YOUNG, DEPARTAMENTO DE RIO NEGRO"), "excluded");
check("tree pruning near MV lines → excluded", live("Tratamiento de espacios verdes Distritos Pando y Atlántida", "Licitación Abreviada", "Ítems: PODAS EN PROXIMIDAD A LINEAS AEREAS DE MEDIA TENSION"), "excluded");
check("stretcher-bearer service → excluded", live("SERVICIO DE CAMILLEROS PARA HOSPITAL DE COLONIA"), "excluded");
check("Rocha: nine dump trucks and two pickups → kept", live("Adquisición de nueve camiones 0 km de 10 m³ de capacidad y dos camionetas 0 km, pick-up doble cabina") !== "excluded", true);
check("trucks in a Licitación Abreviada → not the fleet exemption", live("Adquisición de dos camiones 0 km", "Licitación Abreviada"), "excluded");
check("pickups only → excluded", live("Adquisición de cuatro camionetas 0 km pick-up doble cabina"), "excluded");
check("same two trucks in a Licitación Pública → kept", live("Adquisición de dos camiones 0 km") !== "excluded", true);
check("backhoe hire → excluded", live("Arrendamiento de retroexcavadora"), "excluded");
check("San José street resurfacing, no amount → 常规", live("REMODELACIÓN DE CALLE ESPÍNOLA, EN EL TRAMO COMPRENDIDO ENTRE CALLE ANSINA Y VÍA FÉRREA EN SAN JOSÉ DE MAYO", "Licitación Pública", "Ítems: REPARACION DE PAVIMENTO"), "standard");
check("UTE fire systems in power plants → 常规", live("Servicio de adecuación de sistema de incendio", "Licitación Abreviada", "Ítems: ADECUACION DE LOS SISTEMAS DE INCENDIO EN LAS CENTRALES DE GENERACION DE ENERGIA"), "standard");

// Fences, walls and fire systems are not lifted by the substation or plant they
// are built in, in any country (user, 2026-10-13: 不因为地点在变电站、发电厂就升档).
const site = (country: string, title: string, estimatedValue?: number) =>
  classifyStoredTender({
    title, summary: title, buyer: "x", country, governmentLevel: "public_company", scopeType: "works", procedureType: "Licitación Pública", tenderNumber: "1", sourceName: "test",
    ...(estimatedValue === undefined ? {} : { estimatedValue, currency: "USD" }),
  }).relevance.tier;
check("UTE fence at a substation → 常规", site("Uruguay", "Construcción de cerco olímpico en subestación de trasmisión"), "standard");
check("Peru: fence at a substation → 常规 (was 大型)", site("Peru", "Construcción de cerco perimétrico en subestación de transmisión"), "standard");
check("Colombia: perimeter enclosure of a substation → 常规", site("Colombia", "Construcción de cerramiento perimetral de la subestación eléctrica"), "standard");
check("Mexico: wall at a thermal plant → 常规", site("Mexico", "Construcción de muro perimetral en la Central Termoeléctrica Tula"), "standard");
check("substation named first is the asset → still 大型", site("Peru", "Construcción de subestación eléctrica 60 kV y cerco perimétrico"), "flagship");
check("fence at a substation, US$12M stated → the amount decides", site("Peru", "Construcción de cerco perimétrico en subestación de transmisión", 12_000_000) !== "standard", true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
