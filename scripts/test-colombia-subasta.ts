/**
 * Colombia's subasta inversa, equipment of US$ 1M and up only
 * (lib/relevance-colombia-subasta.ts), against September 2026's real SECOP II
 * rows priced above ~US$ 500K (lib/ingestion/__fixtures__/secop-subasta-inversa-2026-09.json).
 *
 * Usage: npm run test:colombia-subasta
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isIngestedColombiaModalidad, mapSecopRowToTender, type SecopProcesoRow } from "@/lib/ingestion/colombia-mapper";
import { classifyStoredTender } from "@/lib/relevance";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const SOURCE = "SECOP II — Colombia Compra Eficiente";
const rows = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/secop-subasta-inversa-2026-09.json"), "utf8")) as SecopProcesoRow[];
const mapped = rows.map((row) => mapSecopRowToTender(row, SOURCE));
function byName(start: string) {
  const index = rows.findIndex((row) => (row.nombre_del_procedimiento ?? "").startsWith(start));
  if (index < 0) throw new Error(`fixture 里没有「${start}」`);
  return mapped[index];
}

console.log("colombia-subasta\n");

console.log("门槛");
check("逆向竞价进入映射", isIngestedColombiaModalidad("Selección abreviada subasta inversa"), true);
check("小额 Selección Abreviada 仍然不进", isIngestedColombiaModalidad("Selección Abreviada de Menor Cuantía"), false);

console.log("\n整体（9 月 153 条）");
const kept = mapped.filter((t) => t && t.relevance.tier !== "excluded");
check("留下 12 个不同的项目", new Set(kept.map((t) => t!.tenderNumber)).size, 12);
check("留下的都在 100 万美元以上", kept.every((t) => (t!.estimatedValue ?? 0) / 3200 >= 1_000_000), true);

console.log("\n留下的");
check("警用摩托车 → 中型、车辆", [byName("ADQUISICION DE MOTOCICLETAS PARA EL FORTALECIMIENTO")?.relevance.tier, byName("ADQUISICION DE MOTOCICLETAS PARA EL FORTALECIMIENTO")?.industries], ["significant", ["vehicles"]]);
check("9 辆救护车 → 医疗+车辆", byName("ADQUISICIÓN DE 9 AMBULANCIAS")?.industries, ["healthcare", "vehicles"]);
check("LED 路灯（「用于路灯维护」是用途，不是维修合同）→ 中型、电力", [byName("COMPRAVENTA DE LUMINARIAS")?.relevance.tier, byName("COMPRAVENTA DE LUMINARIAS")?.industries], ["significant", ["power"]]);
check("网络安全方案（「含安装、支持和保修」是附带）→ ICT", byName("Adquirir una solución integral de ciberseguridad")?.industries, ["ict_telecom"]);
check("塞萨尔省视频监控和无线电通信 → 中型、ICT", byName("FORTALECIMIENTO DEL SISTEMA INTEGRADO DE EMERGENCIA")?.relevance.tier, "significant");

console.log("\n排除的");
check("航空燃油（1,460 万美元）", byName("SUMINISTRO DE COMBUSTIBLE DE AVIACIÓN")?.relevance.tier, "excluded");
check("实验室试剂（1,330 万美元）", byName("SUMINISTRO DE INSUMOS Y REACTIVOS")?.relevance.tier, "excluded");
check("学校电脑和外设（400 万美元，办公 IT）", byName("ADQUIRIR EQUIPOS DE CÓMPUTO Y PERIFÉRICOS")?.relevance.tier, "excluded");
check("超融合续保（只是延保和支持）", byName("RENOVACION GARANTIAS HIPERCONVERGENCIA")?.relevance.tier, "excluded");
check("沥青混合料", byName("SUMINISTRAR DE MEZCLA")?.relevance.tier, "excluded");

console.log("\n只对哥伦比亚");
const peru = classifyStoredTender({
  title: "ADQUISICIÓN DE CAMIONETAS 4X4",
  summary: "ADQUISICIÓN DE CAMIONETAS 4X4",
  buyer: "GOBIERNO REGIONAL DE CUSCO",
  country: "Peru",
  governmentLevel: "state",
  scopeType: "equipment",
  estimatedValue: 20_000_000,
  currency: "PEN",
  sourceName: "SEACE",
  procedureType: "Subasta Inversa Electrónica",
  tenderNumber: "SIE-SIE-1-2026-GRC-1",
});
check("秘鲁的逆向竞价照旧排除", peru.relevance.tier, "excluded");

if (failures > 0) {
  console.log(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
