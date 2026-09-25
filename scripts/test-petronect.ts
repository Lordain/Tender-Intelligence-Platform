/**
 * Petronect (Petrobras / Transpetro): the envelope parser, the mapper and the
 * source's own relevance rules, against 41 real opportunities captured from
 * the live feed on 2026-09-25 (lib/ingestion/__fixtures__/petronect-open-2026-09-25.json,
 * ITEMS emptied and attachments cut to two per row to keep the file small).
 *
 * The tier list below is the regression net for lib/relevance-petronect.ts.
 * An excluded row is never written, so the keep cases matter most — the whole
 * reason this source has its own rules is that the general ones excluded all
 * 16 international opportunities.
 *
 * Usage: npm run test:petronect
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePetronectEnvelope, petronectAttachmentUrl } from "@/lib/ingestion/connectors/petronect-live";
import { mapPetronectOpportunityToTender, petronectDocumentLinks, PETRONECT_SOURCE_NAME } from "@/lib/ingestion/petronect-mapper";
import { describePetronectStaleness } from "@/lib/ingestion/ingest-petronect";
import { classifyStoredTender } from "@/lib/relevance";
import { platformDay } from "@/lib/tender-status";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const envelope = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/petronect-open-2026-09-25.json"), "utf8"));
const rows = parsePetronectEnvelope(envelope);
const now = new Date("2026-09-25T12:00:00Z");
const bySlug = new Map(rows.map((row) => [row.OPPORT_NUM, mapPetronectOpportunityToTender(row, now)]));

console.log("petronect\n");

console.log("接口解析");
check("41 条真实样本全部解析出来", rows.length, 41);
check("全部映射成功", [...bySlug.values()].filter(Boolean).length, 41);
let threw = false;
try {
  parsePetronectEnvelope({ d: {} });
} catch {
  threw = true;
}
check("缺 EvXml 时报错，而不是当成「没有在招项目」", threw, true);
check("0 条时给出警告", describePetronectStaleness(0, 0) !== null, true);
check("有数据但映射不出来时给出警告", describePetronectStaleness(309, 0) !== null, true);
check("正常情况不警告", describePetronectStaleness(309, 309), null);

const EXPECTED: [string, string, "flagship" | "significant" | "standard" | "excluded"][] = [
  // 大型：EPC、炼厂装置改造/新建、有名字的项目设备包
  ["7004625825", "Mexilhão 项目压缩机组（国际）", "flagship"],
  ["7004554484", "REDUC 改造项目压缩机组（国际）", "flagship"],
  ["7004608199", "SEAP 天然气管道 16/20 寸管（国际）", "flagship"],
  ["7004579659", "RNEST 剩余工程 EPC", "flagship"],
  ["7004591313", "REGAP U-52 焦化装置改造 EPC", "flagship"],
  ["7004553945", "REDUC 催化裂化改造（供货+施工）", "flagship"],
  ["7004609249", "REPLAN 焦化改造", "flagship"],
  ["7004625683", "REPAR 中间馏分加氢装置（标题只有一行）", "flagship"],
  // 中型：国际招标
  ["7004642009", "炼厂催化剂（国际）", "significant"],
  ["7004654015", "分子筛（国际）", "significant"],
  ["7004633698", "换热器（国际）", "significant"],
  ["7004609337", "井控应急服务（国际）", "significant"],
  ["7004623329", "仪表化气瓶（国际）", "significant"],
  ["7004643337", "UMS 维修安全船租赁（国际；UMS 是船型，不是维修合同）", "significant"],
  // 常规：国内框架大宗、工业工程、油田作业
  ["7004654411", "OCTG 油套管（按性质即为大宗）", "standard"],
  ["7004654537", "螺母垫圈（整体合同）", "standard"],
  ["7004649911", "API 6A 阀门（整体合同）", "standard"],
  ["7004643432", "甲醇散装（整体合同）", "standard"],
  ["7004636704", "十六烷值改进剂（炼厂添加剂）", "standard"],
  ["7004636844", "P-53 平台化学品包", "standard"],
  ["7004653642", "Transpetro 区域施工安装框架", "standard"],
  ["7004628308", "设计+供货+施工（Header 32）", "standard"],
  ["7004638393", "新建固废堆场（施工，不是固废清运）", "standard"],
  ["7004598410", "PSV 光船租赁", "standard"],
  ["7004631401", "钢丝作业", "standard"],
  ["7004635229", "地层评价与计量（油田作业）", "standard"],
  // 排除
  ["7004636036", "法律咨询（国际也排除）", "excluded"],
  ["7004636016", "汽轮机检修（国际也排除）", "excluded"],
  ["7004652238", "差旅代理", "excluded"],
  ["7004647810", "安保", "excluded"],
  ["7004653067", "防火阀（国内零星采购）", "excluded"],
  ["7004654380", "保护继电器（国内零星采购）", "excluded"],
  ["7004653308", "油管短节等（国内零星；牌号 TP317L 不是「17 升」）", "excluded"],
  ["7004653716", "完井密封件（采购，不是完井服务）", "excluded"],
  ["7004653803", "滴定仪（「含安装服务」仍是采购）", "excluded"],
  ["7004653422", "饮水机（整体合同也排除）", "excluded"],
  ["7004653865", "润滑油脂", "excluded"],
  ["7004653478", "电子竞价（Pregão）", "excluded"],
  ["7004636781", "地下水监测井", "excluded"],
  ["7004646020", "岩土勘察（标题里有「implantação do projeto」）", "excluded"],
  ["7004640626", "海洋声学数据采集", "excluded"],
];

console.log("\n档位");
for (const [number, name, tier] of EXPECTED) {
  check(`${name} → ${tier}`, bySlug.get(number)?.relevance.tier, tier);
}
check("样本里每一条都有预期档位", EXPECTED.length, rows.length);

console.log("\n字段");
const mexilhao = bySlug.get("7004625825")!;
check("slug", mexilhao.slug, "petronect-7004625825");
check("国际招标 → international_open", mexilhao.participationScope, "international_open");
check("国内招标 → national", bySlug.get("7004579659")!.participationScope, "national");
check("截止时间按巴西利亚时间（UTC-3）", mexilhao.submissionDeadline, "2026-10-07T20:00:00.000Z");
check("网站显示的截止日", platformDay(mexilhao.submissionDeadline!), "2026-10-07");
check("没有金额", mexilhao.estimatedValue, undefined);
check("采购方名称", bySlug.get("7004579659")!.buyer, "Petróleo Brasileiro S.A. (Petrobras)");
check("行业至少含能源矿业", mexilhao.industries.includes("energy_mining"), true);
check("来源名", mexilhao.sourceName, PETRONECT_SOURCE_NAME);

const early = mapPetronectOpportunityToTender(
  { ...rows[0], DOU_PUBL_DATE: "2026-09-01", START_DATE: "2026-09-03", START_HOUR: "08:00:00" },
  now,
)!;
check("发布日期取 DOU 公告和开标期起始中较早的一个", early.publicationDate, "2026-09-01T15:00:00.000Z");

const links = petronectDocumentLinks(rows[0], mexilhao.publicationDate);
check("标书链接来自同一次响应", links.length, rows[0].ANEXOS.length);
check("标书下载地址", links[0]?.sourceUrl, petronectAttachmentUrl(rows[0].ANEXOS[0].PHIO_OBJID));

console.log("\n只作用于 Petronect");
const sameTitleElsewhere = classifyStoredTender({
  title: "Aquisição de Permutador de calor",
  summary: "Aquisição de Permutador de calor",
  buyer: "MUNICIPIO DE EXEMPLO",
  country: "Brazil",
  governmentLevel: "municipal",
  scopeType: "equipment",
  procedureType: "Concorrência - Eletrônica",
  tenderNumber: "1/2026",
  sourceName: "PNCP",
});
check("同一标题来自 PNCP 时仍走通用规则（不会因为 Petronect 规则变成中型）", sameTitleElsewhere.relevance.tier !== "significant", true);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
