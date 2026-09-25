/**
 * Every stored source reaches the right 参标指南 from a tender's detail page,
 * every guide says in Chinese what kind of buyer it is, and the three company
 * sources without a per-tender page get their search steps.
 *
 * Usage: npm run test:guides
 */
import { participationGuideForTender, participationGuides } from "@/lib/participation-guides";
import { tenderSearchGuide } from "@/lib/tender-search-guide";
import { PETRONECT_SOURCE_NAME } from "@/lib/relevance-petronect";
import { CEMIG_SOURCE_NAME } from "@/lib/relevance-cemig";
import { CODELCO_SOURCE_NAME } from "@/lib/relevance-codelco";
import { PETROPERU_SOURCE_NAME } from "@/lib/relevance-petroperu";
import { UPME_SOURCE_NAME } from "@/lib/ingestion/upme-mapper";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

console.log("participation guides\n");

console.log("每份指南都有中文的采购方类型");
for (const guide of participationGuides) {
  check(`${guide.slug}：${guide.issuerType}`, Boolean(guide.issuer && guide.issuerType), true);
}
check("slug 不重复", new Set(participationGuides.map((g) => g.slug)).size, participationGuides.length);

console.log("\n详情页连到对应的指南");
// Source names as stored in production on 2026-09-25, plus the new company sources.
const cases: Array<[string, string, string | undefined]> = [
  ["OECE — Organismo Especializado para las Contrataciones Públicas Eficientes (Perú)", "MUNICIPALIDAD DE EJEMPLO", "peru-seace-oece"],
  ["Compras MX — Difusión de procedimientos (exportación pública)", "SECRETARÍA DE EJEMPLO", "mexico-compras-mx"],
  ["Compras MX", "SECRETARÍA DE EJEMPLO", "mexico-compras-mx"],
  ["Proyectos Estratégicos MX (Hacienda)", "SECRETARÍA DE EJEMPLO", "mexico-proyectos-estrategicos"],
  ["Portal Nacional de Contratações Públicas (PNCP) — busca de editais", "MUNICÍPIO DE EXEMPLO", "brazil-pncp"],
  ["SECOP II — Colombia Compra Eficiente", "ALCALDÍA DE EJEMPLO", "colombia-secop-ii"],
  ["ProInversión — Obras por Impuestos (Perú)", "GOBIERNO REGIONAL", "peru-obras-por-impuestos"],
  ["PEMEX — Concursos Abiertos", "Pemex Exploración y Producción", "mexico-pemex-siscep"],
  ["Diario Oficial de la Federación (DOF) — búsqueda avanzada", "Comisión Federal de Electricidad", "mexico-cfe-micrositio"],
  ["Diario Oficial de la Federación (DOF) — búsqueda avanzada", "SECRETARÍA DE EJEMPLO", undefined],
  ["Mercado Público — 公开招标搜索（智利公共采购平台）", "MUNICIPALIDAD DE EJEMPLO", "chile-mercado-publico"],
  [PETRONECT_SOURCE_NAME, "PETROBRAS", "brazil-petrobras-petronect"],
  [CEMIG_SOURCE_NAME, "Cemig Distribuição S.A.", "brazil-cemig"],
  [UPME_SOURCE_NAME, "UPME", "colombia-upme"],
  [PETROPERU_SOURCE_NAME, "Petróleos del Perú – PETROPERÚ S.A.", "peru-petroperu"],
  [CODELCO_SOURCE_NAME, "Codelco — Casa Matriz", "chile-codelco"],
  ["Portal Nacional de Contratações Públicas (PNCP) — busca de editais", "PETROBRAS TRANSPORTE S.A.", "brazil-pncp"],
];
for (const [sourceName, buyer, slug] of cases) {
  check(`${sourceName.slice(0, 40)} / ${buyer.slice(0, 24)}`, participationGuideForTender({ sourceName, buyer })?.slug, slug);
}

console.log("\n没有单个项目页面的新来源有检索步骤");
const guideFor = (sourceName: string, buyer: string) => tenderSearchGuide({ sourceName, buyer, sourceUrl: "https://example.org/" });
check("Petronect", guideFor(PETRONECT_SOURCE_NAME, "PETROBRAS")?.platform, "Petronect — Oportunidades Abertas");
check("Petroperú", guideFor(PETROPERU_SOURCE_NAME, "Petróleos del Perú – PETROPERÚ S.A.")?.platform, "Petroperú — Competencia internacional");
check("Codelco", guideFor(CODELCO_SOURCE_NAME, "Codelco — Casa Matriz")?.platform, "Codelco — Licitaciones en proceso");
check("Cemig 已有项目页面，不需要步骤", guideFor(CEMIG_SOURCE_NAME, "Cemig Distribuição S.A."), null);
check("UPME 已有项目页面，不需要步骤", guideFor(UPME_SOURCE_NAME, "UPME"), null);
check("PEMEX 不受影响", guideFor("PEMEX — Concursos Abiertos", "Pemex Exploración y Producción")?.platform, "PEMEX — Concursos Abiertos");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
