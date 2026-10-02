/**
 * The SEACE search export (Lista-Procesos.xls) maps the way an OECE record
 * does: procedure from the nomenclature, the same exclusions, a slug the OECE
 * import can find again by number. Rows are copied from the real export of
 * 2026-10-02.
 *
 * Usage: npm run test:peru-seace-list
 */
import * as XLSX from "xlsx";
import {
  isLateRestart,
  mapSeaceListRowToTender,
  readSeaceListFile,
  repairSeaceText,
  seaceListSlug,
  seaceProcedureType,
  type SeaceListRow,
} from "@/lib/ingestion/peru-seace-list";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

const header = ["N°", "Nombre o Sigla de la Entidad", "Fecha y Hora de Publicacion", "Nomenclatura", "Reiniciado Desde", "Objeto de Contratación", "Descripción de Objeto", "VR / VE / Cuantía de la contratación", "Moneda", "Versión SEACE"];
const sheet = [
  header,
  ["1", "GOBIERNO REGIONAL DE JUNIN SEDE CENTRAL", "01/10/2026 18:02", "LP-SM-31-2026-GRJ-1", "", "Obra", "CONTRATACIÓN PARA LA EJECUCIÓN DE OBRA: MEJORAMIENTO Y AMPLIACIÓN DE LOS SERVICIOS DE SALUD DEL HOSPITAL DOMINGO OLAVEGOYA DE JAUJA", "391,130,695.50", "Soles", "3"],
  ["2", "MUNICIPALIDAD DISTRITAL DE SAN JERONIMO - CUSCO", "02/10/2026 07:38", "COMPRE-COMPRE-13-2026-OC-MDSJ/C-1-1", "", "Bien", "CONTRATACION DE EQUIPOS DE PROTECCION PERSONAL", "---", "Soles", "3"],
  ["3", "UNIVERSIDAD NACIONAL DE MOQUEGUA", "02/10/2026 08:21", "LP-ABR-14-2026-COMITÉ/UNAM-3", "Admisión de propuesta técnica", "Bien", "ADQUISICIÓN DE ESTEREOSCOPIO", "---", "Soles", "3"],
];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet), "Sheet0");
const rows = readSeaceListFile(XLSX.write(workbook, { type: "buffer", bookType: "biff8" }) as Buffer);

check("reads every row of an .xls", rows.length, 3);
check("late restart is skipped", rows.map(isLateRestart), [false, false, true]);

const big = mapSeaceListRowToTender(rows[0]) as NonNullable<ReturnType<typeof mapSeaceListRowToTender>>;
check("value parsed", big.estimatedValue, 391130695.5);
check("currency", big.currency, "PEN");
check("publication = Lima day", big.publicationDate, "2026-10-01T00:00:00.000Z");
check("procedure from nomenclature", big.procedureType, "Licitación Pública");
check("works", big.scopeType, "works");
check("a big hospital works is 大型", big.relevance.tier, "flagship");
check("regional government", big.governmentLevel, "state");

const compre = mapSeaceListRowToTender(rows[1] as SeaceListRow);
check("Comparación de Precios is excluded like an OECE row", compre?.relevance.tier, "excluded");

check("slug drops accents", seaceListSlug("LP-ABR-14-2026-COMITÉ/UNAM-3"), "peru-seace-lp-abr-14-2026-comite-unam-3");
check("LP-ABR", seaceProcedureType("LP-ABR-4-2026-MDH/C-1"), "Licitación Pública Abreviada");
check("CP SER-SM", seaceProcedureType("CP SER-SM-8-2026-ES-1"), "Concurso Público");
check("SIE", seaceProcedureType("SIE-SIE-9-2026-X-1"), "Subasta Inversa Electrónica");
check("special regime", seaceProcedureType("RES-PROC-30-2026-DPC-ACFFAA-1"), "Procedimiento especial (RES)");
check(
  "lost curly quotes and dashes restored",
  repairSeaceText("SUPERVISIÓN DE LA OBRA: ¿MEJORAMIENTO DEL SERVICIO DE UCAYALI¿ ¿ CUI N°2704534"),
  'SUPERVISIÓN DE LA OBRA: "MEJORAMIENTO DEL SERVICIO DE UCAYALI" – CUI N°2704534',
);
check("a real question keeps its mark", repairSeaceText("¿QUIÉN PAGA?"), "¿QUIÉN PAGA?");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
