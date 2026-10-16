/**
 * 「按内容选页」(lib/ingestion/page-selection.ts): offline, on synthetic pages
 * shaped like Peru's OECE bases — common provisions first, the tender's own
 * conditions from page 20 — and on the edge cases: a table of contents, a
 * document with no signal, a short document, the character budget.
 */
import { isIndexPage, pageRanges, selectRelevantPages } from "../lib/ingestion/page-selection";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const filler = "El presente documento establece las disposiciones aplicables al procedimiento conforme a la normativa vigente. ".repeat(12);
const general = (n: number) => `SECCIÓN GENERAL ${n}\n${filler}\nLa entidad podrá solicitar garantía conforme a ley.`;
const index = `ÍNDICE\nSECCIÓN GENERAL .......... 3\nSECCIÓN ESPECÍFICA ........ 20\nREQUISITOS DE CALIFICACIÓN ........ 31\nCAPACIDAD TÉCNICA Y PROFESIONAL ........ 32\nEXPERIENCIA DEL POSTOR ........ 33\nFACTORES DE EVALUACIÓN ........ 40\n${filler}`;
const specific = (n: number) =>
  `${n}. REQUISITOS DE CALIFICACIÓN\nA. CAPACIDAD LEGAL\nB. CAPACIDAD TÉCNICA Y PROFESIONAL — personal clave: residente de obra con 5 (cinco) años de experiencia.\nC. EXPERIENCIA DEL POSTOR EN LA ESPECIALIDAD: S/ 12,500,000.00 en obras similares.\nAcreditación: copia de contratos y constancia de conformidad. Garantía de fiel cumplimiento del 10%. Penalidad diaria.\n${filler}`;
const objeto = `CAPÍTULO I GENERALIDADES\n1.2 OBJETO DE LA CONVOCATORIA: ampliación del servicio de agua potable.\n1.3 VALOR REFERENCIAL S/ 25,400,000.00\n1.6 PLAZO DE EJECUCIÓN 300 días calendario. Ubicación: distrito de Cusco.\n${filler}`;

// 113 pages: cover, index, 17 general, the Sección Específica, its chapters, annexes.
const pages: string[] = [`LICITACIÓN PÚBLICA LP-SM-2-2026\n${filler}`, index];
for (let n = 3; n <= 19; n++) pages.push(general(n));
pages.push(`SECCIÓN ESPECÍFICA\nCONDICIONES ESPECIALES DEL PROCEDIMIENTO DE SELECCIÓN\n${filler}`);
pages.push(objeto);
for (let n = 22; n <= 30; n++) pages.push(`Términos de referencia ${n}\n${filler}`);
for (let n = 31; n <= 38; n++) pages.push(specific(n));
while (pages.length < 113) pages.push(`ANEXO ${pages.length + 1}\n${filler}`);

check("Index page recognized", isIndexPage(index), true);
const selection = selectRelevantPages(pages, 20);
const read = selection.pages.map((page) => page + 1);
check("20 pages at most", selection.pages.length <= 20, true);
check("Cover and second page always kept", read.slice(0, 2), [1, 2]);
check("The project description page (objeto, valor referencial) is read", read.includes(21), true);
check("Every 「requisitos de calificación」 page is read", [31, 32, 33, 34, 35, 36, 37, 38].every((page) => read.includes(page)), true);
check("No common-provision page displaces them", read.filter((page) => page >= 3 && page <= 19).length <= 20 - 2 - 1 - 8, true);
const chars = (list: number[]) => list.reduce((sum, page) => sum + pages[page].length, 0);
check("Never more text than the first 20 pages", chars(selection.pages) <= chars(pages.map((_, i) => i).slice(0, 20)), true);
check("A note for the operator", selection.note?.startsWith("按内容选页：读了第 1–2, ") ?? false, true);

// No signal anywhere: the first N, unchanged.
const plain = Array.from({ length: 50 }, (_, i) => `Página ${i + 1}\n${filler}`);
check("No signal: first N pages", selectRelevantPages(plain, 20).pages, Array.from({ length: 20 }, (_, i) => i));
check("No signal: no note", selectRelevantPages(plain, 20).note, null);

// Short documents are sent whole.
check("Shorter than the cap: every page", selectRelevantPages(pages.slice(0, 12), 20).pages.length, 12);

// Character budget: one very long requirement page cannot push the text past the first N pages'.
const heavy = [...pages];
heavy[37] = specific(38).repeat(40);
const heavySelection = selectRelevantPages(heavy, 20);
const heavyChars = (list: number[]) => list.reduce((sum, page) => sum + heavy[page].length, 0);
check("Budget holds with an oversized page", heavyChars(heavySelection.pages) <= heavyChars(heavy.map((_, i) => i).slice(0, 20)), true);
check("The oversized page is the one dropped", heavySelection.pages.includes(37), false);

// A scan is read as images: the page count is the cost, the OCR length is not.
const scanSelection = selectRelevantPages(heavy, 20, { budget: "pages" });
check("Scan: never more pages than the cap", scanSelection.pages.length <= 20, true);
check("Scan: a long OCR page is not dropped for its length", scanSelection.pages.includes(37), true);

check("Page ranges", pageRanges([1, 2, 3, 7, 9, 10]), "1–3, 7, 9–10");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
