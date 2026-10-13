/** Offline checks for the Dominican, Uruguayan and Panamanian award readers (lib/ingestion/award-sources.ts). */
import { balboaFigures, findAdjudicacionActa, parsePanamaAdjudicacion } from "../lib/ingestion/connectors/panama-panamacompra-live";
import { panamaFlowFromUrl, panamaPublicUrl } from "../lib/ingestion/panama-mapper";
import { uruguayAwardParts } from "../lib/ingestion/award-sources";
import { uruguayPurchaseId } from "../lib/ingestion/ingest-uruguay";
import { combineAwardParts } from "../lib/ingestion/award-results";
import { dominicanStatus } from "../lib/ingestion/dominicana-mapper";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

// Panama: figures written both ways round (2026-10-13 resolutions).
check("B/.185,000.00", balboaFigures("por la suma de … (B/.185,000.00)."), [185000]);
check("B/. 73.399,65 (decimal comma)", balboaFigures("(B/. 73.399,65)."), [73399.65]);
check("B/64,000.00 (no dot)", balboaFigures("Por un monto de B/64,000.00"), [64000]);
check("B/.1,579,060.16", balboaFigures("B/.1,579,060.16"), [1579060.16]);

const resolution = (resuelve: string, offers: { name: string; totals: number[] }[], fecha = "13-10-2026 - 10:10 AM") => ({
  pageComponentes: [
    { identificador: "resuelve", tipo: "label", value: resuelve },
    { identificador: "otrosResuelve", tipo: "componentAgreagarTextArea", value: [{ texto: "SEGUNDO: Ordenar que se realice la publicación …" }] },
    {
      identificador: "",
      tipo: "componentOfertasAdjudicadasProponentes",
      value: offers.map((offer) => ({ empresa: { nombreComercial: offer.name }, procesosOfertasItems: offer.totals.map((precioTotal) => ({ precioTotal, nuevoPrecioTotal: null })) })),
    },
    { identificador: "footer", tipo: "componentFooterActas", value: { fechaRealizada: fecha } },
  ],
});
check(
  "BIO LAB: the resolution's figure",
  parsePanamaAdjudicacion(resolution("PRIMERO: Adjudicar el Acto Público No. 2026-6-13-01-08-LP-000015 al proponente BIO LAB INTERNACIONAL, S. A., por la suma de … (B/.185,000.00).", [{ name: "BIO LAB INTERNACIONAL, S.A.", totals: [184000, 1000] }])),
  { suppliers: ["BIO LAB INTERNACIONAL, S.A."], amount: 185000, date: "2026-10-13" },
);
check(
  "resolution names no figure → the winning offers' total",
  parsePanamaAdjudicacion(resolution("ADJUDICAR a las empresas PREMIUM SAFETY de la Licitación Pública …", [{ name: "Premium Safety", totals: [36797.3, 43286.85] }], "08-10-2026 - 09:00 AM")),
  { suppliers: ["Premium Safety"], amount: 80084.15, date: "2026-10-08" },
);
check(
  "a mistyped figure (B/ 64,00.00 for 64,000.00) → the offers' total",
  parsePanamaAdjudicacion(resolution("Adjudicar a la empresa SERVICIOS MULTIPLES la Licitación Pública … por un monto de B/ 64,00.00 balboas.", [{ name: "SERVICIOS MULTIPLES", totals: [64000] }])).amount,
  64000,
);
check(
  "two renglones to two winners, summed",
  parsePanamaAdjudicacion(resolution("PRIMERO: Adjudicar el renglón 1 a ALFA, S.A. por B/.10,000.00 y el renglón 2 a BETA, S.A. por B/.5,500.50.", [{ name: "ALFA, S.A.", totals: [10000] }, { name: "BETA, S.A.", totals: [5500.5] }])),
  { suppliers: ["ALFA, S.A.", "BETA, S.A."], amount: 15500.5, date: "2026-10-13" },
);
check(
  "the latest award resolution of a procedure",
  findAdjudicacionActa([
    { nombre: "Acta de apertura", rutaNueva: "/ps/ver-acta-apertura/publico", fechaRealizada: "2026-10-02T16:51:26.000Z" },
    { nombre: "Resolución de Adjudicación", rutaNueva: "/ps/adjudicacion/acta/preview-publico", fechaRealizada: "2026-10-05T10:00:00.000Z", paramsBody: { idProcesosContratacionRegistroActas: 1 } },
    { nombre: "Resolución de Adjudicación", rutaNueva: "/ps/adjudicacion/acta/preview-publico", fechaRealizada: "2026-10-13T15:10:19.000Z", paramsBody: { idProcesosContratacionRegistroActas: 2 } },
  ])?.paramsBody,
  { idProcesosContratacionRegistroActas: 2 },
);
const url = panamaPublicUrl({ numProceso: "2026-6-13-01-08-LP-000015", idProcesosContratacionFlujos: 1041649, idTipoProceso: 7 });
check("Panama link → flow and type", panamaFlowFromUrl(url), { idProcesosContratacionFlujos: 1041649, idTipoProceso: 7 });
check("any other link → null", panamaFlowFromUrl("https://www.panamacompra.gob.pa/Inicio/#/busqueda-avanzada"), null);

// Uruguay: Σ quantity × unit price per award (adjudicacion-1374970, 2026-09-30).
check("Uruguay purchase id from slug", uruguayPurchaseId("uruguay-1374970"), "1374970");
const uy = combineAwardParts(
  "uruguay-1374970",
  [
    { id: "a", status: "active", date: "2026-09-29T00:00:00Z", suppliers: [{ name: "QUIMICA CENIT S A" }], items: [{ quantity: 1, unit: { value: { amount: 4397.25, currency: "UYU" } } }] },
    { id: "b", status: "active", date: "2026-09-29T00:00:00Z", suppliers: [{ name: "EMEDICAL S.A." }], items: [{ quantity: 2, unit: { value: { amount: 125250, currency: "UYU" } } }] },
  ].flatMap(uruguayAwardParts),
);
check("Uruguay award folded", uy, { slug: "uruguay-1374970", awardDate: "2026-09-29", suppliers: ["QUIMICA CENIT S A", "EMEDICAL S.A."], amount: 254897.25, currency: "UYU" });

// Dominican Republic: one contract per lot, summed (CORAASAN-CCC-LPN-2026-0023).
check(
  "DR contracts folded",
  combineAwardParts("dominicana-x", [
    { supplier: "Rene Anibal Rodriguez Martinez", amount: 17732000, currency: "DOP", date: "2026-08-31T14:00:00Z" },
    { supplier: "Sivinox, SRL", amount: 18161000, currency: "DOP", date: "2026-08-31T15:00:00Z" },
  ]),
  { slug: "dominicana-x", awardDate: "2026-08-31", suppliers: ["Rene Anibal Rodriguez Martinez", "Sivinox, SRL"], amount: 35893000, currency: "DOP" },
);
check("DR 'Proceso adjudicado y celebrado' → awarded", dominicanStatus("Proceso adjudicado y celebrado", undefined, new Date()), "awarded");
check("DR 'Proceso desierto' → deserted", dominicanStatus("Proceso desierto", undefined, new Date()), "deserted");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
