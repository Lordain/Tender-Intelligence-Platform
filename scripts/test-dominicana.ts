/**
 * Dominican Republic (DGCP open data), against real rows captured 2026-10-04
 * (lib/ingestion/__fixtures__/dgcp-procesos-2026-09.json).
 *
 * Usage: npm run test:dominicana
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DgcpProceso } from "@/lib/ingestion/connectors/dominicana-dgcp-live";
import { DOMINICANA_INGESTED_MODALIDADES, isIngestedDgcpProceso } from "@/lib/ingestion/connectors/dominicana-dgcp-live";
import { dominicanGovernmentLevel, dominicanStatus, dominicanTime, mapDgcpProcesoToTender } from "@/lib/ingestion/dominicana-mapper";
import { ingestDominicana } from "@/lib/ingestion/ingest-dominicana";
import { isStagedCountry } from "@/lib/staged-countries";
import { AVAILABLE_COUNTRIES } from "@/lib/tender-list-page";
import { countryLabel } from "@/lib/tender-labels";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const rows = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/dgcp-procesos-2026-09.json"), "utf8")) as DgcpProceso[];
const byCode = (code: string) => rows.find((row) => row.codigo_proceso === code)!;
const NOW = new Date("2026-10-04T12:00:00Z");

console.log("dominicana\n\n采购方式");
check("公开招标（全国）收", DOMINICANA_INGESTED_MODALIDADES.test("Licitación Pública Nacional"), true);
check("公开招标（简易）收", DOMINICANA_INGESTED_MODALIDADES.test("Licitación Pública Abreviada"), true);
check("门槛以下采购不收", DOMINICANA_INGESTED_MODALIDADES.test("Compras por Debajo del Umbral"), false);
check("比价不收", DOMINICANA_INGESTED_MODALIDADES.test("Comparación de Precios"), false);
check("全国紧急状态例外程序（PEEN）收", isIngestedDgcpProceso({ modalidad: "Procesos de Excepción", codigo_proceso: "EDESUR-MAE-PEEN-2026-0008" }), true);
check("其他例外程序（PEPU 独家供应）不收", isIngestedDgcpProceso({ modalidad: "Procesos de Excepción", codigo_proceso: "EDESUR-DAF-CM-PEPU-2026-0001" }), false);
check("其他例外程序（PEUR 紧急）不收", isIngestedDgcpProceso({ modalidad: "Procesos de Excepción", codigo_proceso: "MOPC-MAE-PEUR-2026-0003" }), false);
check("编号带 PEEN 但不是例外程序不收", isIngestedDgcpProceso({ modalidad: "Compras por Debajo del Umbral", codigo_proceso: "X-PEEN-1" }), false);
check("公开招标照收", isIngestedDgcpProceso({ modalidad: "Licitación Pública Internacional", codigo_proceso: "EDEESTE-CCC-LPI-2026-0001" }), true);

console.log("\n字段");
check("「Z」按圣多明各时间读（UTC-4）", dominicanTime("2026-11-12T10:00:00Z"), "2026-11-12T14:00:00.000Z");
check("七位小数秒也能读", dominicanTime("2026-09-28T08:01:40.6266667Z"), "2026-09-28T12:01:40.626Z");
check("市政府 → 市级", dominicanGovernmentLevel("Ayuntamiento Santo Domingo Este"), "municipal");
check("配电公司 → 国企", dominicanGovernmentLevel("Empresa de Distribución Eléctrica del Norte"), "public_company");
check("部委 → 中央", dominicanGovernmentLevel("Ministerio de Obras Públicas y Comunicaciones"), "federal");
check("已取消", dominicanStatus("Cancelado", undefined, NOW), "cancelled");
check("截标已过 → 已截标", dominicanStatus("Proceso publicado", "2026-09-01T00:00:00Z", NOW), "submission_closed");

console.log("\n映射（真实行）");
const road = mapDgcpProcesoToTender(byCode("MOPC-CCC-LPN-2026-0019"), NOW);
// 2026-10-10: transport/works/water rows with an amount use their own bands
// (中型 from US$10M, 大型 from US$30M — lib/relevance.ts).
check("公路工程 ~2,300 万美元 → 中型、工程、招标中", [road.relevance.tier, road.scopeType, road.status], ["significant", "works", "open"]);
check("slug 与国家", [road.slug, road.country, countryLabel(road.country, "zh")], ["dominicana-mopc-ccc-lpn-2026-0019", "Dominican Republic", "多米尼加"]);
check("截标时间按当地时间", road.submissionDeadline, "2026-11-12T14:00:00.000Z");
check("官方链接去掉双斜杠", road.sourceUrl, "https://comunidad.comprasdominicana.gob.do/Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1777402");
check("员工餐 → 排除", mapDgcpProcesoToTender(byCode("PASAPORTES-CCC-LPN-2026-0002"), NOW).relevance.tier, "excluded");

// Real row, read 2026-10-05 (EDESUR, national-emergency procedure under Decreto 630-2026).
const transformers = mapDgcpProcesoToTender(
  {
    codigo_proceso: "EDESUR-MAE-PEEN-2026-0008",
    unidad_compra: "Empresa Distribuidora de Electricidad del Sur",
    modalidad: "Procesos de Excepción",
    tipo_excepcion: "Emergencia",
    titulo: "ADQUISICIÓN TRANSFORMADORES DE POTENCIA",
    descripcion: "ADQUISICIÓN TRANSFORMADORES DE POTENCIA",
    estado_proceso: "Proceso publicado",
    divisa: "DOP",
    monto_estimado: 522553892.7,
    fecha_publicacion: "2026-10-01T18:00:18.3133333Z",
    fecha_fin_recepcion_ofertas: "2026-10-30T09:30:00Z",
    url: "https://comunidad.comprasdominicana.gob.do//Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1779162",
    objeto_proceso: "Bienes",
    subobjeto_proceso: "Bienes no comunes ni estandarizados",
    organismo_financiero_externo: "No",
  } as DgcpProceso,
  NOW,
);
check("紧急程序：电力变压器 ~830 万美元 → 保留、招标中", [transformers.relevance.tier !== "excluded", transformers.status], [true, "open"]);
check("紧急程序标明是公开征集", transformers.procedureType, "Proceso de Excepción por Emergencia Nacional (convocatoria abierta)");

async function main() {
  console.log("\n导入（不写库）");
  const run = await ingestDominicana(null, { write: false, now: NOW, fetchProcesos: async () => rows });
  check("门槛以下的不读", run.publicTenderCount, rows.filter((row) => row.modalidad.startsWith("Licitaci") || /-PEEN-/.test(row.codigo_proceso)).length);
  check("已取消的不留", run.kept.some((tender) => tender.status === "cancelled"), false);
  check("公路工程留下", run.kept.some((tender) => tender.tenderNumber === "MOPC-CCC-LPN-2026-0019"), true);

  console.log("\n公开");
  // Opened 2026-10-04 (user: 公开多米尼加); Ecuador opened 2026-10-06.
  check("多米尼加已公开", isStagedCountry("Dominican Republic"), false);
  check("多米尼加在前台国家名单里", (AVAILABLE_COUNTRIES as readonly string[]).includes("Dominican Republic"), true);
  check("厄瓜多尔已公开（2026-10-06）", isStagedCountry("Ecuador"), false);

  if (failures > 0) {
    console.log(`\n${failures} 项失败`);
    process.exit(1);
  }
  console.log("\n全部通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
