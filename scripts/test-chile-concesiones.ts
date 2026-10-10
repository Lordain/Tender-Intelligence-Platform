/**
 * Chile's public-works concessions (MOP DGC): the list and project-page
 * parsers on pages saved 2026-10-10, the mapper, and the source's own
 * relevance rules — including that the Mercado Público title rule which
 * excluded "Segunda Concesión Ruta 5 …" still applies to every other source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConcesionesList, parseConcesionProject, spanishDate } from "../lib/ingestion/connectors/chile-concesiones-live";
import { concesionBudget, concesionDocumentLinks, mapConcesionToTender, CHILE_CONCESIONES_SOURCE_NAME } from "../lib/ingestion/chile-concesiones-mapper";
import { classifyStoredTender } from "../lib/relevance";

const dir = join(__dirname, "../lib/ingestion/__fixtures__/chile-concesiones");
const read = (name: string) => readFileSync(join(dir, name), "utf8");

// List page: six projects in four categories.
const list = parseConcesionesList(read("list-2026-10-10.html"));
assert.equal(list.length, 6);
assert.equal(list[0].name, "Segunda Concesión Ruta 5 Tramo Collipulli – Temuco");
assert.equal(list[0].category, "Ruta Panamericana de Chile y sus accesos");
assert.equal(list[5].url, "https://concesiones.mop.gob.cl/project/centro-penitenciario-de-calama/");

// Dates and budgets as the pages write them.
assert.equal(spanishDate("17 de diciembre de 2026 (circular aclaratoria en trámite)"), "2026-12-17");
assert.equal(spanishDate("13 de enero de 2026 "), "2026-01-13");
assert.equal(spanishDate("Por definir"), undefined);
assert.deepEqual(concesionBudget("UF 26.535.000"), { value: 26_535_000, currency: "UF" });
assert.deepEqual(concesionBudget("MM USD 946,2 (UF 23.893.000)"), { value: 23_893_000, currency: "UF" });
assert.deepEqual(concesionBudget("MM USD 113"), { value: 113_000_000, currency: "USD" });
assert.equal(concesionBudget(undefined), undefined);

// Ruta 5: open until 17 December, UF budget, a note on the dates.
const ruta5 = parseConcesionProject(read("ruta-5-collipulli-temuco-2026-10-10.html"), list[0]);
assert.equal(ruta5.budgetText, "UF 26.535.000");
assert.equal(ruta5.calledOn, "2026-05-13");
assert.equal(ruta5.offersDue, "2026-12-17");
assert.equal(ruta5.economicOpening, "2027-01-14");
assert.deepEqual(ruta5.dateNotes, ["circular aclaratoria en trámite"]);
assert.equal(ruta5.region, "Araucanía");
assert.match(ruta5.description ?? "", /^El proyecto corresponde a la re licitación/);
assert.equal(ruta5.documents.length, 6);

const now = new Date("2026-10-10T15:00:00Z");
const tender = mapConcesionToTender(ruta5, "2026-10-10", now);
assert.ok(tender);
assert.equal(tender.slug, "chile-concesion-segunda-concesion-ruta-5-tramo-collipulli-temuco");
assert.equal(tender.sourceName, CHILE_CONCESIONES_SOURCE_NAME);
assert.equal(tender.estimatedValue, 26_535_000);
assert.equal(tender.currency, "UF");
assert.equal(tender.scopeType, "works");
assert.equal(tender.participationScope, "international_open");
// 23:59 in Santiago, which is UTC-3 in December.
assert.equal(tender.submissionDeadline, "2026-12-18T02:59:00.000Z");
assert.equal(tender.publicationDate, "2026-05-13T16:00:00.000Z");
assert.equal(tender.relevance.tier, "flagship");
assert.ok(tender.industries.includes("construction"));
assert.ok(tender.industries.includes("transportation"));
assert.match(tender.summary.es, /Recepción de ofertas técnicas y económicas: 2026-12-17 \(circular aclaratoria en trámite\)/);
// The list of companies that bought the bases is not a bid document.
const links = concesionDocumentLinks(ruta5);
assert.equal(links.length, 5);
assert.ok(links.every((link) => !/comprado/i.test(link.documentType ?? "")));

// Offers already in: not mapped.
const tsunami = parseConcesionProject(read("alerta-tsunami-2026-10-10.html"), list[4]);
assert.equal(tsunami.offersDue, "2026-01-13");
assert.equal(tsunami.budgetText, "MM USD 113");
assert.equal(mapConcesionToTender(tsunami, "2026-10-10", now), null);
const ruta57 = parseConcesionProject(read("ruta-57-2026-10-10.html"), list[1]);
assert.equal(ruta57.offersDue, "2026-08-12");
assert.equal(mapConcesionToTender(ruta57, "2026-10-10", now), null);
// …but the day itself still counts as open.
assert.ok(mapConcesionToTender(ruta57, "2026-08-12", now));

// The source's own rules.
const base = {
  summary: "x",
  buyer: "Ministerio de Obras Públicas — Dirección General de Concesiones (DGC)",
  country: "Chile",
  governmentLevel: "federal" as const,
  scopeType: "works" as const,
  procedureType: undefined,
  tenderNumber: undefined,
};
const tier = (title: string, sourceName: string, value?: [number, string]) =>
  classifyStoredTender({ ...base, title, sourceName, ...(value ? { estimatedValue: value[0], currency: value[1] } : {}) }).relevance.tier;
assert.equal(tier("Segunda Concesión Ruta 5 Tramo Collipulli – Temuco", CHILE_CONCESIONES_SOURCE_NAME, [26_535_000, "UF"]), "flagship");
assert.equal(tier("AIF A. Vespucio Oriente - AVO II", CHILE_CONCESIONES_SOURCE_NAME, [500_000, "UF"]), "excluded");
assert.equal(tier("Concesión Mirador Urbano", CHILE_CONCESIONES_SOURCE_NAME, [10_000, "UF"]), "excluded");
assert.equal(tier("Concesión Mirador Urbano", CHILE_CONCESIONES_SOURCE_NAME), "significant");
// Mercado Público's own rule is untouched: a municipal concession is still a service there.
assert.equal(tier("CNG-CONCESIÓN CASINOS", "Mercado Público (ChileCompra) — Licitaciones", [50_000_000, "CLP"]), "excluded");

console.log("chile-concesiones: all checks passed");
