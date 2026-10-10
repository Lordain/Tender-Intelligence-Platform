/**
 * World Bank procurement notices (lib/ingestion/worldbank-mapper.ts), against
 * four Bolivian notices read from the API on 2026-10-09
 * (lib/ingestion/__fixtures__/worldbank-procnotices-bolivia-2026-10-09.json;
 * no contact fields, the notice text cut short and its e-mail replaced).
 * Also checks that a call the World Bank finances and its SICOES Ficha
 * become one row (lib/ingestion/lender-reference.ts).
 *
 * Usage: npm run test:worldbank
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorldBankNotice } from "@/lib/ingestion/connectors/worldbank-procnotices-live";
import { mapWorldBankNotice, worldBankAmount, worldBankDocumentChannels, worldBankMarket, worldBankNumber, worldBankSkipReason, zonedIso } from "@/lib/ingestion/worldbank-mapper";
import { mapSicoesToTender, parseSicoesProcesses } from "@/lib/ingestion/bolivia-sicoes-paste";
import { lenderReference } from "@/lib/ingestion/lender-reference";
import { findCrossSourceMatch, type MatchCandidate } from "@/lib/ingestion/cross-source-match";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const fixtures = join(__dirname, "../lib/ingestion/__fixtures__");
const notices = JSON.parse(readFileSync(join(fixtures, "worldbank-procnotices-bolivia-2026-10-09.json"), "utf8")) as WorldBankNotice[];
const NOW = new Date("2026-10-09T22:00:00Z");

console.log("数字、金额、市场、时区");
check("欧式金额带 .-", worldBankNumber("26.193.790,72.-"), 26193790.72);
check("美式金额", worldBankNumber("1,250,000.00"), 1250000);
check("标注 + Bs.", worldBankAmount("El precio referencial total de la obra es de Bs. 26.193.790,72.- (Veintiséis…)"), { value: 26193790.72, currency: "BOB" });
check("标注 + USD", worldBankAmount("Presupuesto oficial: USD 3,500,000.00"), { value: 3500000, currency: "USD" });
check("数字在前、币种在后", worldBankAmount("Monto estimado 12.000.000,00 bolivianos"), { value: 12000000, currency: "BOB" });
check("只有 $ 不读", worldBankAmount("Presupuesto oficial: $ 3,500,000"), undefined);
check("没有标注不读", worldBankAmount("Bs. 26.193.790,72"), undefined);
check("国内公开", worldBankMarket("SOLICITUD DE OFERTAS ABIERTA NACIONAL"), "national");
check("国际公开", worldBankMarket("Licitación Pública Internacional"), "international_open");
check("英文国际", worldBankMarket("Open International competitive procurement"), "international_open");
check("未说明", worldBankMarket("Solicitud de ofertas"), undefined);
check("拉巴斯 UTC-4", zonedIso("2026-10-23T00:00:00Z", "15:30", "America/La_Paz"), "2026-10-23T15:30:00-04:00");
check("圣地亚哥夏令时 UTC-3", zonedIso("2026-12-01T00:00:00Z", "10:00", "America/Santiago"), "2026-12-01T10:00:00-03:00");
check("圣地亚哥冬令时 UTC-4", zonedIso("2026-07-01T00:00:00Z", "10:00", "America/Santiago"), "2026-07-01T10:00:00-04:00");
check("同一时刻", Date.parse(zonedIso("2026-12-01T00:00:00Z", "10:00", "America/Santiago")!), Date.parse("2026-12-01T13:00:00.000Z"));
// date columns keep the day as written: a late local deadline stays on its own day, not UTC's next one.
check("墨西哥 18:00 仍是当天", zonedIso("2026-10-10", "18:00", "America/Mexico_City")?.slice(0, 10), "2026-10-10");

console.log("哪些公告读取");
check("工程招标读取", worldBankSkipReason(notices[0]), undefined);
check("授标结果跳过", worldBankSkipReason(notices[1])?.startsWith("不是招标公告"), true);
check("询价方式跳过", worldBankSkipReason({ ...notices[0], procurement_method_name: "Request for Quotations" })?.startsWith("小额"), true);
check("个人咨询跳过", worldBankSkipReason({ ...notices[3], procurement_method_name: "Individual Consultant Selection" })?.startsWith("小额"), true);
check("非平台国家跳过", worldBankSkipReason({ ...notices[0], project_ctry_name: "Bhutan" })?.startsWith("不是平台国家"), true);

console.log("ENDE 农村电网（BO-ENDE-568421-CW-RFB）");
const t = mapWorldBankNotice(notices[0], NOW);
check("编号", t.tenderNumber, "BO-ENDE-568421-CW-RFB");
check("slug", t.slug, "bolivia-bo-ende-568421-cw-rfb");
check("国家", t.country, "Bolivia");
check("采购方", t.buyer, "Empresa Nacional de Electricidad");
check("国企", t.governmentLevel, "public_company");
check("工程", t.scopeType, "works");
check("金额", [t.estimatedValue, t.currency], [26193790.72, "BOB"]);
check("国内公开", t.participationScope, "national");
check("截止（当地 15:30）", t.submissionDeadline, "2026-10-23T15:30:00-04:00");
check("状态", t.status, "open");
check("约 219 万美元 → 常规", t.relevance.tier, "standard");
check("官方公告链接", t.sourceUrl, `https://projects.worldbank.org/en/projects-operations/procurement-detail/${notices[0].id}`);
check("没有联系人邮箱", JSON.stringify(t).includes("@"), false);
check("标书获取渠道（ENDE 官网）", t.summary.es.includes("https://www.ende.bo/nacional-internacional/vigentes/"), true);
check("会议链接不算标书渠道", worldBankDocumentChannels("ver https://ende.webex.com/x y https://www.ende.bo/docs."), ["https://www.ende.bo/docs"]);

console.log("和 SICOES 手动导入不重复");
check("识别世行编号", lenderReference(" bo-ende-568419-cw-rfb "), "BO-ENDE-568419-CW-RFB");
check("机构自编号不是世行编号", lenderReference("GAMLG-LP-O N° 05/2026"), undefined);
const ficha = readFileSync(join(fixtures, "sicoes-ficha-web-ende-2026-10-09.txt"), "utf8");
const fromSicoes = mapSicoesToTender(parseSicoesProcesses(ficha)[0], NOW);
const fromBank = mapWorldBankNotice({ ...notices[0], bid_reference_no: "BO-ENDE-568419-CW-RFB" }, NOW);
check("同一项目 → 同一 slug", fromSicoes.slug, fromBank.slug);
check("同一项目 → 同一编号", fromSicoes.tenderNumber, fromBank.tenderNumber);

console.log("和本国平台已有项目比对（2026-10-09 只读报告里的三对）");
const stored = (title: string, buyer: string, submissionDeadline: string): MatchCandidate => ({ slug: "x", tenderNumber: "x", title, summary: "", buyer, submissionDeadline, sourceName: "x" });
check(
  "ADIF 变电站 → 很可能同一项目",
  findCrossSourceMatch(
    { reference: "AR-DGPPSE-ADIF-486312-CW-RFB", title: "Intervención en Subestaciones Rectificadoras de San Fernando, Victoria, San Isidro, Olivos, Núñez y Palermo", buyer: "ADIF S.A.", submissionDeadline: "2026-11-17T17:00:00.000Z" },
    [stored("Intervención en Subestaciones Rectificadoras de San Fernando, Victoria, San Isidro, Olivos, Núñez y Palermo - LPN 40/2026", "Trenes Argentinos Infraestructura (ADIF S.A.)", "2026-11-17T00:00:00.000Z")],
  )?.kind,
  "strong",
);
check(
  "巴西两个不同咨询（截止差 89 天、采购方不同）→ 不算",
  findCrossSourceMatch(
    { title: "Contratação de empresa de consultoria para desenvolvimento do projeto executivo da sede da APAC.", buyer: "Secretariat of Water Resources and Sanitation", submissionDeadline: "2026-10-09T13:00:00.000Z" },
    [stored("Contratação integrada de empresa especializada em engenharia e arquitetura para a elaboração de solução completa", "ESTADO DE MATO GROSSO", "2027-01-07T13:00:00.000Z")],
  ),
  undefined,
);
check(
  "厄瓜多尔道路 vs 桥梁（同日截止、标题不同）→ 不算",
  findCrossSourceMatch(
    { title: "REHABILITACION DE LA VÍA EL DESEO – LA INMACULADA - CRUCE BUENO, CANTÓN YAGUACHI", buyer: "Gobierno Autonomo Descentralizado Provincial del Guayas", submissionDeadline: "2026-11-05T20:00:00.000Z" },
    [stored("CONSTRUCCIÓN DEL PUENTE VEHICULAR DE 70 METROS DE LUZ DOBLE CARRIL SOBRE EL RIO PINDO GRANDE", "GOBIERNO AUTONOMO DESCENTRALIZADO MUNICIPAL DEL CANTON PASTAZA", "2026-11-05T00:00:00.000Z")],
  ),
  undefined,
);
check(
  "库里写着世行编号 → 编号相同",
  findCrossSourceMatch({ reference: "BO-ENDE-568419-CW-RFB", title: "x", buyer: "y" }, [{ ...stored("Const. electrificación", "ENDE", "2026-11-06T00:00:00.000Z"), tenderNumber: "BO-ENDE-568419-CW-RFB" }])?.kind,
  "reference",
);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
if (failures > 0) process.exit(1);
