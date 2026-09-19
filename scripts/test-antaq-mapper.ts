/**
 * The ANTAQ mapper, run over the five real captured pages.
 *
 * The assertions that matter here are the ones about what the mapper must
 * NOT do: invent a value, call a consultation `open`, or let a hearing whose
 * only title is a reference number through the no-content rule.
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseAntaqHearing } from "@/lib/ingestion/antaq-audiencia-parser";
import { mapAntaqHearingToTender } from "@/lib/ingestion/antaq-mapper";
import { ANTAQ_SOURCE_NAME, isNationalPrioritySource, NATIONAL_PRIORITY_SOURCE_NAME } from "@/lib/relevance";
import type { Tender } from "@/types/tender";

const DIR = "lib/ingestion/__fixtures__/antaq";
const SOURCE = "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas/audiencias/x";

let ran = 0;
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  ran += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}

console.log("── 国家级重点源现在是一组，不是一个 ──");
check("ANTAQ 算国家级重点源", isNationalPrioritySource(ANTAQ_SOURCE_NAME), true);
check("墨西哥那个还算（没被挤掉）", isNationalPrioritySource(NATIONAL_PRIORITY_SOURCE_NAME), true);
check("别的源不算", isNationalPrioritySource("Brasil PNCP"), false);
check("null 不算，也不报错", isNationalPrioritySource(null), false);

const files = readdirSync(DIR).filter((f) => f.endsWith(".html") && !f.startsWith("00-") && !f.startsWith("01-")).sort();
const mapped: { file: string; tender: Tender }[] = [];

console.log(`\n── 五份真实页面映射出来的行 ──`);
for (const file of files) {
  const hearing = parseAntaqHearing(readFileSync(`${DIR}/${file}`, "utf8"), SOURCE);
  const tender = hearing === null ? null : mapAntaqHearingToTender(hearing, new Date("2026-09-19T12:00:00Z"));
  if (tender === null) {
    check(`${file} 映射出来了`, null, "一个 Tender");
    continue;
  }
  mapped.push({ file, tender });
  const tag = file.slice(0, 22);
  check(`${tag} 不带金额`, tender.estimatedValue, undefined);
  check(`${tag} 不带币种`, tender.currency, undefined);
  check(`${tag} 源名是 ANTAQ`, tender.sourceName, ANTAQ_SOURCE_NAME);
  check(`${tag} 联邦级`, tender.governmentLevel, "federal");
  check(`${tag} 归为工程`, tender.scopeType, "works");
  // Nobody can bid on a consultation. `open` would put a customer on a
  // deadline that does not exist.
  check(`${tag} 状态是「计划中」`, tender.status, "planned");
  // The one that would have made the connector write nothing:
  // upsertTendersBatched drops every tender whose submissionDeadline has
  // passed, and all five comment periods had closed before the capture.
  check(`${tag} 不设交标截止日（征询截止不是交标截止）`, tender.submissionDeadline, undefined);
  check(`${tag} slug 有 antaq 前缀`, tender.slug.startsWith("antaq-"), true);
  check(`${tag} 标题不是纯编号`, /^\s*audi[êe]ncia\s+p[úu]blica\s+n[º°]?\s*\d+\/\d{4}\s*-?\s*ANTAQ\s*$/i.test(tender.title.es), false);
  check(`${tag} 有发布日期`, /^\d{4}-\d{2}-\d{2}$/.test(tender.publicationDate), true);
  check(`${tag} 关键日期至少一条`, tender.keyDates.length > 0, true);
}

console.log(`\n── 具体的行 ──`);
const itj = mapped.find((m) => m.file.startsWith("02-"))?.tender;
if (itj) {
  check("ITJ01 slug", itj.slug, "antaq-07-2026-itj01");
  check("ITJ01 标号", itj.tenderNumber, "AP 07/2026");
  check("ITJ01 标题就是项目本身", itj.title.es, "ARRENDAMENTO DA ÁREA ITJ01 LOCALIZADA NO PORTO ORGANIZADO DE ITAJAÍ/SC");
  check("ITJ01 发布日期", itj.publicationDate, "2026-06-25");
  check("ITJ01 征询截止日在关键日期里，类型是「问询截止」", itj.keyDates.find((d) => d.type === "questions_deadline")?.date, "2026-08-13");
  // 征询截止 2026-08-13，跑批时间 2026-09-19，已经过了 —— 摘要里要说清楚
  check("ITJ01 摘要写明征询已结束", itj.summary.es.includes("Consulta pública encerrada em 2026-08-13"), true);
  check("ITJ01 摘要里带上了日程原文", itj.summary.es.includes("29/06/2026 a 13/08/2026"), true);
  check("ITJ01 关键日期两条（发布 + 问询截止）", itj.keyDates.map((d) => d.type), ["publication", "questions_deadline"]);
  // The whole point of the flag: no amount, and still not 常规.
  check("ITJ01 没有金额但没被压成常规", itj.relevance.tier === "standard", false);
  console.log(`      → 档位 ${itj.relevance.tier} / 行业 ${itj.industries.join(",")}`);
}

const ssb = mapped.find((m) => m.file.startsWith("06-"))?.tender;
if (ssb) {
  check("SSB01 slug", ssb.slug, "antaq-07-2025-ssb01");
  check("SSB01 标号带年份，不会跟 07/2026 撞", ssb.tenderNumber, "AP 07/2025");
}
check("五份的 slug 互不重复", new Set(mapped.map((m) => m.tender.slug)).size, mapped.length);

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
