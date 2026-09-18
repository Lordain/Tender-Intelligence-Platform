/**
 * The real DOF notice that broke twice, pinned as a test.
 *
 * CFE-0001-CAAAT-0148-2026 (dof-5799003, published 15/09/2026). Its field
 * table is transcribed verbatim below from `npm run probe:dof-notice --
 * 5799003 15/09/2026`, five-digit year and all — DOF really does print
 *
 *     Fallo | 9/11/02026, 12:00 hrs
 *
 * and the old `\d{4}` year capture read that as the year 202, ~1800 years in
 * the past, which then satisfied every "has the fallo happened yet?" test and
 * published an open tender as 已中标.
 *
 * Two independent defects met on this row and each is asserted separately
 * below, because either one alone would have been enough to produce the bug
 * and fixing only one would leave it half-live:
 *   - the date parser accepted a malformed year and silently produced a wrong
 *     date (fixed by normalising the year and rejecting implausible results);
 *   - the mapper read a fallo date as an award (fixed by not reporting
 *     outcomes from a source that publishes schedules).
 *
 *   npm run test:dof-notice-dates
 */
import { mapDofSearchNotaToTender } from "../lib/ingestion/dof-search-mapper";
import type { DofNoticeDetail } from "../lib/ingestion/connectors/dof-notice-detail";

const DETAIL: DofNoticeDetail = {
  procedureNumber: "CFE-0001-CAAAT-0148-2026",
  title: "Equipo de Medición Térmica, Acústica y Dieléctrica para Líneas de Transmisión.",
  fieldsByLabel: {
    "Fecha de publicación en Micrositio": "15/09/2026",
    "Sesión de Aclaraciones": "28/09/2026, 15:00 hrs",
    "Límite para presentación de ofertas": "26/10/2026, 11:00 hrs",
    "Apertura Técnica": "26/10/2026, 12:30 hrs",
    "Apertura Económica": "3/11/2026, 10:00 hrs",
    "Fallo": "9/11/02026, 12:00 hrs",
  },
};

const tender = mapDofSearchNotaToTender(
  {
    codNota: 5799003,
    titulo: "COMISION FEDERAL DE ELECTRICIDAD - REF:5799003",
    fecha: "2026/09/15",
    codOrgaUno: "CONVOCATORIAS PARA CONCURSOS",
  } as Parameters<typeof mapDofSearchNotaToTender>[0],
  "Diario Oficial de la Federación (DOF) — búsqueda avanzada",
  DETAIL,
);

const dayOf = (iso: string | undefined) => iso?.slice(0, 10);
const keyDate = (type: string) => dayOf(tender?.keyDates.find((k) => k.type === type)?.date);

const CHECKS: [string, unknown, unknown][] = [
  ["the notice maps at all", tender !== null, true],
  ["publication date is the notice's own", dayOf(tender?.publicationDate), "2026-09-15"],
  ["submission deadline is the 'Límite para presentación de ofertas' row", dayOf(tender?.submissionDeadline), "2026-10-26"],
  ["clarification session", keyDate("clarification"), "2026-09-28"],
  // The fix: 9 November 2026, not 9 November 0202. dd/mm, as it always was —
  // the day and month were never the problem.
  ["the five-digit year is normalised, not truncated", keyDate("award"), "2026-11-09"],
  // The other fix. Even with the date correct, a fallo row is a line on a
  // timetable, and this source never reports outcomes.
  ["status is open while bidding is still ahead", tender?.status, "open"],
];

let failed = 0;
for (const [name, actual, expected] of CHECKS) {
  if (actual === expected) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// A year this parser cannot make sense of must produce NO key date, never a
// guessed one — asserted separately since it has no row in the real notice.
const implausible = mapDofSearchNotaToTender(
  {
    codNota: 1,
    titulo: "COMISION FEDERAL DE ELECTRICIDAD - REF:1",
    fecha: "2026/09/15",
    codOrgaUno: "CONVOCATORIAS PARA CONCURSOS",
  } as Parameters<typeof mapDofSearchNotaToTender>[0],
  "Diario Oficial de la Federación (DOF) — búsqueda avanzada",
  { ...DETAIL, fieldsByLabel: { ...DETAIL.fieldsByLabel, Fallo: "9/11/20260, 12:00 hrs" } },
);
if (implausible?.keyDates.some((k) => k.type === "award")) {
  failed += 1;
  console.log("  FAIL  an unreadable year is skipped, not guessed at");
} else {
  console.log("  ok    an unreadable year is skipped, not guessed at");
}

console.log(`\n${CHECKS.length + 1 - failed}/${CHECKS.length + 1} passed`);
if (failed > 0) process.exit(1);
