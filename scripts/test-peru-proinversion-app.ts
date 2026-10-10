/**
 * ProInversión's APP concursos: the cronograma parser on detail pages saved
 * 2026-10-10 (the schedule block only), the mapper on the saved portfolio
 * entries, and the ingest's window — without the network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAppSchedule, convocatoriaDate, type ProinversionAppProject } from "../lib/ingestion/connectors/peru-proinversion-app-live";
import { isAppConcursoUnderWay, mapAppProjectToTender, PROINVERSION_APP_SOURCE_NAME } from "../lib/ingestion/peru-proinversion-app-mapper";
import { appClosingStatus, ingestPeruProinversionApp } from "../lib/ingestion/ingest-peru-proinversion-app";
import { deriveTenderStatus } from "../lib/tender-status";
import { deadlineIsInDocuments } from "../lib/deadline-in-documents";

const dir = join(__dirname, "../lib/ingestion/__fixtures__/peru-proinversion-app");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const portfolio = (JSON.parse(read("portfolio-2026-10-10.json")) as { Data: ProinversionAppProject[] }).Data;
const bySlug = (slug: string) => portfolio.find((project) => project.Slug === slug)!;

// Schedules.
const grupo2 = parseAppSchedule(read("cronograma-grupo-2-2026-10-10.html"));
assert.deepEqual(grupo2.map((step) => step.step), ["Encargo o Asignación del Sector", "Convocatoria / DI", "Buena Pro"]);
assert.equal(convocatoriaDate(grupo2), "2025-12-23");
assert.equal(grupo2[2].when, "IV TRIMESTRE 2026");
assert.equal(grupo2[2].done, false);
const choquequirao = parseAppSchedule(read("cronograma-choquequirao-2026-10-10.html"));
assert.equal(convocatoriaDate(choquequirao), "2025-03-28");
// A step printed with no state of its own is not counted as done.
assert.equal(choquequirao.find((step) => /VFC/.test(step.step))?.done, false);
assert.equal(parseAppSchedule("<html><body>nothing here</body></html>").length, 0);

// Which projects are concursos under way: Transacción and not awarded.
const underWay = portfolio.filter(isAppConcursoUnderWay).map((project) => project.NombreCorto);
assert.equal(underWay.length, 6);
assert.ok(underWay.includes("Grupo 2 del Plan de Transmisión 2025-2034"));
assert.ok(!portfolio.filter((project) => /adjudicad/i.test(project.Estado)).some(isAppConcursoUnderWay));
assert.ok(!portfolio.filter((project) => project.Fase === "Estructuración").some(isAppConcursoUnderWay));

// The mapper.
const now = new Date("2026-10-10T15:00:00Z");
const tender = mapAppProjectToTender(bySlug("grupo-2-del-plan-de-transmision-2025-2034"), grupo2, now);
assert.ok(tender);
assert.equal(tender.slug, "peru-proinversion-app-grupo-2-del-plan-de-transmision-2025-2034");
assert.equal(tender.tenderNumber, "PROINVERSION-APP-844");
assert.equal(tender.sourceName, PROINVERSION_APP_SOURCE_NAME);
assert.equal(tender.buyer, "Agencia de Promoción de la Inversión Privada (ProInversión)");
assert.equal(tender.estimatedValue, 538_880_000);
assert.equal(tender.currency, "USD");
assert.equal(tender.status, "open");
assert.equal(tender.submissionDeadline, undefined);
// Noon in Lima (UTC-5).
assert.equal(tender.publicationDate, "2025-12-23T12:00:00-05:00");
assert.equal(tender.relevance.tier, "flagship");
assert.ok(tender.industries.includes("power"));
assert.match(tender.summary.es, /Buena pro prevista: IV TRIMESTRE 2026\./);
assert.match(tender.summary.es, /no publica aquí la fecha límite/);
// No call date on the schedule → not mapped.
assert.equal(mapAppProjectToTender(bySlug("grupo-2-del-plan-de-transmision-2025-2034"), [], now), null);
// A regional government's operation-and-maintenance concession: its own buyer, and the general upkeep rule.
const sullana = portfolio.find((project) => /Sullana/.test(project.NombreCorto))!;
const sullanaTender = mapAppProjectToTender(sullana, [{ step: "Convocatoria / DI", when: "17/03/2026", date: "2026-03-17", done: true }], now)!;
assert.equal(sullanaTender.buyer, "Gobierno Regional Piura (con ProInversión)");
assert.equal(sullanaTender.governmentLevel, "state");
assert.equal(sullanaTender.scopeType, "services");
assert.equal(sullanaTender.relevance.tier, "excluded");

// A concurso called in December has no deadline and is still open in October:
// the 45-day guess is not applied to this source (user, 2026-10-10: 秘鲁的都显示已截止？).
assert.equal(deriveTenderStatus("open", { publicationDate: tender.publicationDate, sourceName: PROINVERSION_APP_SOURCE_NAME }, now), "open");
assert.equal(deriveTenderStatus("open", { publicationDate: tender.publicationDate, sourceName: "Peru OECE" }, now), "submission_closed");
assert.equal(deriveTenderStatus("awarded", { publicationDate: tender.publicationDate, sourceName: PROINVERSION_APP_SOURCE_NAME }, now), "awarded");
assert.equal(deadlineIsInDocuments(tender), true);
// The import closes them instead, from the project's state.
const calledGrupo2 = bySlug("grupo-2-del-plan-de-transmision-2025-2034");
assert.equal(appClosingStatus(calledGrupo2), null);
assert.equal(appClosingStatus({ ...calledGrupo2, Estado: "Adjudicado" }), "awarded");
assert.equal(appClosingStatus({ ...calledGrupo2, Estado: "Desierto" }), "deserted");
assert.equal(appClosingStatus({ ...calledGrupo2, Estado: "Suspendido" }), "suspended");
assert.equal(appClosingStatus({ ...calledGrupo2, Fase: "Ejecución Contractual" }), "submission_closed");
assert.equal(appClosingStatus(undefined), "submission_closed");

async function windowChecks() {
  // The ingest's 3-day window counts from the call date.
  const schedules = Object.fromEntries(portfolio.map((project) => [project.Slug, project.Slug === "grupo-2-del-plan-de-transmision-2025-2034" ? grupo2 : []]));
  const windowed = await ingestPeruProinversionApp(null, { write: false, now, portfolio, schedules });
  assert.equal(windowed.open.length, 0);
  assert.equal(windowed.openBeforeWindow.length, 1);
  assert.equal(windowed.notCalled.length, 5);
  const recent = await ingestPeruProinversionApp(null, { write: false, now: new Date("2025-12-24T15:00:00Z"), portfolio, schedules });
  assert.equal(recent.open.length, 1);
  const unbounded = await ingestPeruProinversionApp(null, { write: false, days: 0, now, portfolio, schedules });
  assert.equal(unbounded.open.length, 1);
}

windowChecks()
  .then(() => console.log("peru-proinversion-app: all checks passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
