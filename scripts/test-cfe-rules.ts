/**
 * CFE's own relevance rules (lib/relevance-cfe.ts), against real CFE calls
 * the DOF published between 2026-06-26 and 2026-09-25
 * (lib/ingestion/__fixtures__/cfe-dof-2026-09-25.json — number, buyer,
 * title and the tier each must get, chosen from a review of all 224).
 *
 * The keeps are the ones the old path lost: the DOF carries no supply type,
 * so every CFE purchase — poles, capacitor banks, conductors, boiler tube —
 * was excluded as a routine service.
 *
 * Usage: npm run test:cfe-rules
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyStoredTender } from "@/lib/relevance";
import { isCfeCall } from "@/lib/relevance-cfe";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const DOF = "Diario Oficial de la Federación (DOF) — búsqueda avanzada";
type Case = { tenderNumber: string; buyer: string; title: string; expected: string };
const cases = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/cfe-dof-2026-09-25.json"), "utf8")) as Case[];

function classify(c: { tenderNumber: string; buyer: string; title: string }, sourceName = DOF) {
  return classifyStoredTender({
    title: c.title,
    summary: c.title,
    buyer: c.buyer,
    country: "Mexico",
    governmentLevel: "public_company",
    // What the DOF mapper stores for every notice — the reason these rules exist.
    scopeType: "services",
    procedureType: "Concurso Abierto",
    tenderNumber: c.tenderNumber,
    sourceName,
  });
}

console.log("cfe rules\n");
console.log("档位");
for (const c of cases) check(`${c.tenderNumber} ${c.title.replace(/\s+/g, " ").slice(0, 60)} → ${c.expected}`, classify(c).relevance.tier, c.expected);

console.log("\n识别");
check("CFE 编号即识别", isCfeCall({ tenderNumber: "CFE-0001-CAAAT-0115-2026" }), true);
check("没有编号时按采购单位识别", isCfeCall({ buyer: "COMISION FEDERAL DE ELECTRICIDAD", tenderNumber: "DOF-REF-1" }), true);
check("其他采购单位不适用", isCfeCall({ buyer: "PETROLEOS MEXICANOS", tenderNumber: "DOF-REF-1" }), false);
check("行业含能源矿业", classify(cases[0]).industries.includes("energy_mining"), true);

console.log("\n只作用于 DOF");
check(
  "同一条来自别的来源时仍走通用规则",
  classify({ tenderNumber: "CFE-0001-CAAAT-0115-2026", buyer: "COMISION FEDERAL DE ELECTRICIDAD", title: "Postes de concreto para líneas de transmisión" }, "Compras MX").relevance.tier,
  "excluded",
);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
