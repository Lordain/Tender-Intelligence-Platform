/**
 * Regression tests for stripProcessPhaseSuffix (lib/ingestion/colombia-mapper.ts).
 *
 * This one function has now been wrong twice, both times in a way that was
 * invisible until someone went looking:
 *
 *  1. 2026-09-11 — SECOP republishes a procurement with a phase label glued
 *     onto the reference AND the name, which produced two rows for one tender.
 *  2. 2026-09-12 — SECOP truncates `nombre_del_procedimiento` at exactly 200
 *     characters, so a phase label at the end loses its closing parenthesis.
 *     The regex needed a closed parenthetical, so "(Fase de Selección (P" went
 *     into the public feed as part of the title, and made the republished copy
 *     look like a different tender to anything comparing titles.
 *
 * Both directions matter: a phase label must go, and a meaningful
 * parenthetical ("(Grupo 2)", "(Obra)") must stay — merging on one of those
 * would silently join two genuinely different tenders.
 *
 * Usage: npm run test:colombia-titles
 */
import { stripProcessPhaseSuffix } from "../lib/ingestion/colombia-mapper";

/** The tail of each real 200-character row, with the leading text elided. */
const TRUNCATED_REAL_ROWS: [string, string][] = [
  ["... DEPARTAMENTO DE AMAZONAS. (Fase de Selección (P", "... DEPARTAMENTO DE AMAZONAS."],
  ["... EN SEDES URBANAS Y RURALES (Presentació", "... EN SEDES URBANAS Y RURALES"],
  ["... DEPARTAMENTO DE ARAUCA (Fase de Selecci", "... DEPARTAMENTO DE ARAUCA"],
  ["... DEPARTAMENTO DE ARAUCA (Fas", "... DEPARTAMENTO DE ARAUCA"],
  ["... NORTE DE SANTANDER (Fase de Selección (Presentación de oferta", "... NORTE DE SANTANDER"],
  ["... DEL CAQUETÁ (Fase de Selecció", "... DEL CAQUETÁ"],
  ["... VILLANUEVA CASANARE (Fase de Selección (P", "... VILLANUEVA CASANARE"],
];

const CLOSED_PHASE_LABELS: [string, string][] = [
  ["JBB-LP-004-2026 (Presentación de oferta)", "JBB-LP-004-2026"],
  ["CONCESION CAV (Fase de Selección (Presentación de ofertas))", "CONCESION CAV"],
  ["OBRA (Borrador)", "OBRA"],
  ["OBRA (Convocatoria)", "OBRA"],
];

/** Must survive untouched — cutting any of these would merge different tenders. */
const MEANINGFUL: [string, string][] = [
  ["OBRA CIVIL (Grupo 2)", "OBRA CIVIL (Grupo 2)"],
  ["OBRA CIVIL (Grupo 2", "OBRA CIVIL (Grupo 2"],
  ["CONSTRUCCION (ETAPA", "CONSTRUCCION (ETAPA"],
  ["SUMINISTRO (A", "SUMINISTRO (A"], // under the 3-character floor
  ["MANTENIMIENTO (Obra)", "MANTENIMIENTO (Obra)"],
  ["FASE I; SECTOR OCCIDENTAL COMUNA 7", "FASE I; SECTOR OCCIDENTAL COMUNA 7"],
  ["MEJORAMIENTO DE VÍAS (LOTE 3)", "MEJORAMIENTO DE VÍAS (LOTE 3)"],
];

const MIXED: [string, string][] = [
  ["OBRA (Grupo 2) (Fase de Selecci", "OBRA (Grupo 2)"],
  ["OBRA (Grupo 2) (Presentación de oferta)", "OBRA (Grupo 2)"],
  ["", ""],
  ["   SOLO ESPACIOS   ", "SOLO ESPACIOS"],
];

function run(label: string, cases: [string, string][]): number {
  let failures = 0;
  console.log(`\n${label}`);
  for (const [input, expected] of cases) {
    const got = stripProcessPhaseSuffix(input);
    if (got === expected) {
      console.log(`  OK    ${JSON.stringify(input)}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${JSON.stringify(input)}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(got)}`);
    }
  }
  return failures;
}

const total =
  TRUNCATED_REAL_ROWS.length + CLOSED_PHASE_LABELS.length + MEANINGFUL.length + MIXED.length;
const failures =
  run("截断的阶段后缀（SECOP 200 字符截断，真实数据）", TRUNCATED_REAL_ROWS) +
  run("完整的阶段后缀", CLOSED_PHASE_LABELS) +
  run("有意义的括号——必须原样保留", MEANINGFUL) +
  run("混合与边界", MIXED);

console.log(`\n${total - failures}/${total} checks passed.`);
if (failures > 0) process.exit(1);
