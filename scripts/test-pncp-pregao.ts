/**
 * PNCP Pregão Eletrônico, equipment only (lib/relevance-pncp-pregao.ts),
 * against two real days of PNCP (lib/ingestion/__fixtures__/pncp-pregao-2026-10-02.json:
 * the 196 pregões published 2026-09-30 – 10-02 that named an equipment class,
 * plus 60 random others, each with the item-list amount measured that day).
 *
 * Usage: npm run test:pncp-pregao
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapPncpSearchRowToTender, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";
import { BRAZIL_PNCP_SOURCE_NAME, pregaoEquipmentClasses } from "@/lib/relevance-pncp-pregao";
import { classifyStoredTender } from "@/lib/relevance";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

type FixtureRow = PncpSearchRow & { measuredValueBrl: number | null };
const rows = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/pncp-pregao-2026-10-02.json"), "utf8")) as FixtureRow[];
const now = new Date("2026-10-02T15:00:00Z");

function map(row: FixtureRow) {
  return mapPncpSearchRowToTender(row, row.measuredValueBrl ? [{ valorTotal: row.measuredValueBrl }] : undefined, BRAZIL_PNCP_SOURCE_NAME, now);
}
function byText(start: string): FixtureRow {
  const row = rows.find((r) => (r.description ?? "").includes(start));
  if (!row) throw new Error(`fixture 里没有「${start}」`);
  return row;
}

console.log("pncp-pregao\n");

console.log("整体");
const mapped = rows.map(map);
check("256 行全部映射", mapped.filter(Boolean).length, 256);
const kept = mapped.filter((t) => t && t.relevance.tier !== "excluded");
check("两天只留 5 条", kept.length, 5);
check("留下的都在 200 万美元以上", kept.every((t) => (t!.estimatedValue ?? 0) / 5.16 >= 2_000_000), true);

console.log("\n留下的（真实金额）");
const marinha = map(byText("Aquisição de Viaturas para a Marinha do Brasil"));
check("海军军用车辆 R$ 1.56 亿 → 大型、车辆", [marinha?.relevance.tier, marinha?.industries], ["flagship", ["vehicles"]]);
const lab = map(byText("aquisição de equipamentos de laboratório, incluindo instalação"));
check("实验室设备（含安装）→ 常规、医疗", [lab?.relevance.tier, lab?.industries], ["standard", ["healthcare"]]);
const ti = map(byText("fornecimento de equipamentos de Tecnologia da Informação"));
check("IT 设备供货（附带安装配置服务）→ 常规、ICT", [ti?.relevance.tier, ti?.industries], ["standard", ["ict_telecom"]]);

console.log("\n排除的");
const licences = map(byText("950 licenças"));
check("950 套终端安全软件许可（R$ 14 亿）→ 排除", licences?.relevance.tier, "excluded");
const desktops = map(byText("Aquisição de computadores, notebooks, monitores e nobreaks"));
check("办公电脑和 UPS（R$ 3,500 万）→ 排除", desktops?.relevance.tier, "excluded");
check("维修平地机 → 不是设备采购", pregaoEquipmentClasses(byText("conserto da motoniveladora").description ?? ""), []);
check("清洗车辆和重型机械 → 不是设备采购", pregaoEquipmentClasses(byText("Limpeza e Higienização de Veículos").description ?? ""), []);
check("拖车服务 → 不是设备采购", pregaoEquipmentClasses(byText("serviços de guinchos").description ?? ""), []);
check("HPE 延保 → 不是设备采购", pregaoEquipmentClasses(byText("extensão de garantia").description ?? ""), []);
check("给医疗部门买食品（单位名里有救护车）→ 不是设备采购", pregaoEquipmentClasses(byText("GÊNEROS ALIMENTÍCIOS PARA ATENDER AS NECESSIDADES DO CENTROS").description ?? ""), []);
check("学生文具包（「servidores administrativos」是公务员）→ 不是设备采购", pregaoEquipmentClasses(byText("kits escolares completos").description ?? ""), []);
const backhoe = map(byText("Aquisição de 01 (uma) retroescavadeira, nova"));
check("市政府买一台挖掘机 → 工程机械，但金额太小排除", [backhoe?.industries, backhoe?.relevance.tier], [["heavy_equipment"], "excluded"]);
const sealed = rows.filter((r) => r.measuredValueBrl === null && pregaoEquipmentClasses(r.description ?? "").length > 0).map(map);
check("设备类但没有金额的全部排除", sealed.every((t) => t?.relevance.tier === "excluded"), true);

console.log("\n只作用于电子竞价");
const concorrencia = classifyStoredTender({
  title: "Aquisição de Viaturas para a Marinha do Brasil",
  summary: "Aquisição de Viaturas para a Marinha do Brasil",
  buyer: "COMANDO DA MARINHA",
  country: "Brazil",
  governmentLevel: "federal",
  scopeType: "equipment",
  estimatedValue: 155_884_000,
  currency: "BRL",
  sourceName: BRAZIL_PNCP_SOURCE_NAME,
  procedureType: "Concorrência - Eletrônica",
  tenderNumber: "00394502000144-1-000001/2026",
});
check("同一来源的 Concorrência 不走电子竞价规则（理由里没有 Pregão）", concorrencia.relevance.reason.zh.includes("Pregão"), false);

if (failures > 0) {
  console.log(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
