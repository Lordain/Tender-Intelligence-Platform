/**
 * PEMEX's own relevance rules (lib/relevance-pemex.ts), against 29 real
 * procedures from PEMEX's seven lists, captured 2026-09-25
 * (lib/ingestion/__fixtures__/pemex-concursos-2026-09-25.json — each with the
 * tier it must get, chosen from a review of all 472 published in the 120
 * days before).
 *
 * The keeps are the point: before these rules the general classifier kept 3
 * of the 71 procedures published in the month, and excluded the chemicals,
 * valves, pipe and rig lease this site is for.
 *
 * Usage: npm run test:pemex-rules
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapPemexConcursoItemToTender, type PemexConcursoItem } from "@/lib/ingestion/pemex-mapper";
import { KNOWN_BUYER_NAMES, type PemexListTitle } from "@/lib/ingestion/pemex-sources";
import { PEMEX_SOURCE_NAME, pemexProcedureType } from "@/lib/relevance-pemex";
import { classifyStoredTender } from "@/lib/relevance";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

type Case = { list: PemexListTitle; expected: string; item: PemexConcursoItem };
const cases = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/pemex-concursos-2026-09-25.json"), "utf8")) as Case[];

console.log("pemex rules\n");
console.log("档位");
for (const { list, expected, item } of cases) {
  const tender = mapPemexConcursoItemToTender(item, KNOWN_BUYER_NAMES[list] ?? "PEMEX", PEMEX_SOURCE_NAME, list);
  check(`${(item.descripcion ?? "").replace(/\s+/g, " ").slice(0, 70)} → ${expected}`, tender?.relevance.tier, expected);
}

console.log("\n字段");
const rig = cases.find((c) => c.item.Title?.trim() === "DEE-CAT-A-GCEE-100-106823-26-1")!;
const rigTender = mapPemexConcursoItemToTender(rig.item, "Pemex Exploración y Producción", PEMEX_SOURCE_NAME, rig.list)!;
check("程序类型末尾带招标范围（重新分类要读）", rigTender.procedureType.endsWith("· Internacional bajo TLC"), true);
check("行业含能源矿业", rigTender.industries.includes("energy_mining"), true);
check("没有 tipoevento 时不加后缀", pemexProcedureType("Concurso Abierto", undefined), "Concurso Abierto");

console.log("\n重新分类与导入一致");
const stored = classifyStoredTender({
  title: rigTender.title.es,
  summary: rigTender.summary.es,
  buyer: rigTender.buyer,
  country: "Mexico",
  governmentLevel: "public_company",
  scopeType: rigTender.scopeType,
  procedureType: rigTender.procedureType,
  tenderNumber: rigTender.tenderNumber,
  sourceName: PEMEX_SOURCE_NAME,
});
check("用存储字段重新分类得到同一档位", stored.relevance.tier, rigTender.relevance.tier);

console.log("\n只作用于 PEMEX 列表");
const elsewhere = classifyStoredTender({
  title: "ALQUILUROS PARA PLANTA DE POLIETILENO",
  summary: "ALQUILUROS PARA PLANTA DE POLIETILENO",
  buyer: "PEMEX TRANSFORMACION INDUSTRIAL",
  country: "Mexico",
  governmentLevel: "public_company",
  scopeType: "equipment",
  procedureType: "Licitación Pública · Internacional",
  tenderNumber: "DOF-1",
  sourceName: "Diario Oficial de la Federación (DOF) — búsqueda avanzada",
});
check("DOF 来的同一标题仍走通用规则", elsewhere.relevance.tier, "excluded");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
