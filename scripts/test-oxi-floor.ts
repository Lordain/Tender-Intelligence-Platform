/** Offline checks for the Obras por Impuestos US$5M floor (lib/relevance.ts applyOxiFloor). */
import { classifyStoredTender } from "../lib/relevance";
import { PERU_OXI_SOURCE_NAME } from "../lib/ingestion/peru-oxi-mapper";
import { convertToUsd } from "../lib/currency";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${String(expected)}, got ${String(actual)}`}`);
}

const PEN_PER_USD = 1 / (convertToUsd(1, "PEN") ?? 0.3);
const base = {
  title: "MEJORAMIENTO DEL SERVICIO DE EDUCACION PRIMARIA Y SECUNDARIA DE LA I.E. 16536 SAN MIGUEL",
  summary: "MEJORAMIENTO DEL SERVICIO DE EDUCACION PRIMARIA Y SECUNDARIA DE LA I.E. 16536 SAN MIGUEL",
  buyer: "GOBIERNO REGIONAL DE CAJAMARCA",
  country: "Peru",
  governmentLevel: "state" as const,
  scopeType: "works" as const,
  procedureType: "Empresa Privada",
  tenderNumber: "OXI-001-2026",
};
const tier = (sourceName: string, usd?: number) =>
  classifyStoredTender({ ...base, sourceName, ...(usd === undefined ? {} : { estimatedValue: Math.round(usd * PEN_PER_USD), currency: "PEN" }) }).relevance.tier;

check("OxI US$3M → 已过滤", tier(PERU_OXI_SOURCE_NAME, 3_000_000), "excluded");
check("OxI US$4.9M → 已过滤", tier(PERU_OXI_SOURCE_NAME, 4_900_000), "excluded");
check("OxI US$6M → kept", tier(PERU_OXI_SOURCE_NAME, 6_000_000) !== "excluded", true);
check("OxI US$25M → kept", tier(PERU_OXI_SOURCE_NAME, 25_000_000) !== "excluded", true);
check("OxI no amount, rated 常规 otherwise → 已过滤", tier(PERU_OXI_SOURCE_NAME), "excluded");
// Same project through ordinary SEACE/OECE: the OxI floor does not apply.
check("OECE US$3M → not touched by the OxI floor", tier("OECE — Organismo Especializado para las Contrataciones Públicas Eficientes (Perú)", 3_000_000) !== "excluded", true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
