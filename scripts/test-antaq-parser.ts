/**
 * The ANTAQ hearing parser, run against the five real pages in
 * `__fixtures__/antaq/`.
 *
 * Two kinds of assertion, on purpose. The invariants run over whatever files
 * are in the fixture directory, so a re-capture (Actions → Probe Brazil doors
 * → what=capture, which commits fresh pages) still exercises them and fails
 * loudly if ANTAQ changes its template. The exact values are pinned only for
 * the pages they were read from, because a pinned value that silently moves
 * with a recapture teaches the test to be ignored.
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseAntaqHearing, parseBrazilianDate, type AntaqHearing } from "@/lib/ingestion/antaq-audiencia-parser";

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
function ok(name: string, condition: boolean, detail = "") {
  check(`${name}${detail === "" ? "" : ` ${detail}`}`, condition, true);
}

const hearingFiles = readdirSync(DIR)
  .filter((f) => f.endsWith(".html") && !f.startsWith("00-") && !f.startsWith("01-"))
  .sort();

console.log(`── 日期 ──`);
check("DD/MM/YYYY HHhMM 丢掉时分，只留日历日", parseBrazilianDate("25/06/2026 17h14"), "2026-06-25");
check("光有日期也认", parseBrazilianDate("13/08/2026"), "2026-08-13");
check("认不出来就是 undefined，不是瞎猜一个", parseBrazilianDate("em breve"), undefined);
check("空的就是 undefined", parseBrazilianDate(undefined), undefined);
check("32 月不是月份，宁可没有", parseBrazilianDate("01/32/2026"), undefined);

console.log(`\n── 每一份真实页面都要成立的 (${hearingFiles.length} 份) ──`);
const parsed: { file: string; hearing: AntaqHearing }[] = [];
for (const file of hearingFiles) {
  const hearing = parseAntaqHearing(readFileSync(`${DIR}/${file}`, "utf8"), SOURCE);
  if (hearing === null) {
    check(`${file} 解析出来了`, "null", "一个 AntaqHearing");
    continue;
  }
  parsed.push({ file, hearing });
  const tag = file.slice(0, 22);
  ok(`${tag} 场次号形如 NN/YYYY`, /^\d{2}\/\d{4}$/.test(hearing.number), `→ ${hearing.number}`);
  ok(`${tag} 年份对得上场次号`, hearing.year === Number(hearing.number.slice(3)));
  ok(`${tag} 有项目一句话说明`, (hearing.subject ?? "").length > 20);
  ok(`${tag} 有发布日期`, /^\d{4}-\d{2}-\d{2}$/.test(hearing.publishedAt ?? ""), `→ ${hearing.publishedAt}`);
  ok(`${tag} 有截止日期`, /^\d{4}-\d{2}-\d{2}$/.test(hearing.contributionsDeadline ?? ""), `→ ${hearing.contributionsDeadline}`);
  ok(`${tag} 日程表至少一行`, hearing.schedule.length > 0, `→ ${hearing.schedule.length} 行`);
  ok(`${tag} 至少一个 PDF 附件`, hearing.notices.length > 0, `→ ${hearing.notices.length} 个`);
  ok(`${tag} 附件 URL 全是绝对地址`, hearing.notices.every((n) => n.url.startsWith("https://")));
  // The one section that leads to the draft edital. If this stops matching,
  // the connector still imports hearings but loses the document that makes
  // them worth importing — so it is an assertion, not a nice-to-have.
  ok(`${tag} 有「Minutas」那一栏（草案标书在这后面）`, hearing.documentSections.some((d) => /minuta/i.test(d.title)), `→ ${hearing.documentSections.map((d) => d.title).join(" / ")}`);
}

console.log(`\n── 针对具体页面钉死的值 ──`);
const itj = parsed.find((p) => p.file.startsWith("02-"))?.hearing;
if (itj) {
  check("ITJ01 场次号", itj.number, "07/2026");
  check("ITJ01 港区代码", itj.projectCode, "ITJ01");
  check("ITJ01 项目说明", itj.subject, "ARRENDAMENTO DA ÁREA ITJ01 LOCALIZADA NO PORTO ORGANIZADO DE ITAJAÍ/SC");
  check("ITJ01 发布日期", itj.publishedAt, "2026-06-25");
  check("ITJ01 截止日期", itj.contributionsDeadline, "2026-08-13");
  check("ITJ01 日程三行", itj.schedule.length, 3);
  check("ITJ01 日程第一行", itj.schedule[0], { order: "1", event: "Consulta Pública - Período de Contribuições", when: "29/06/2026 a 13/08/2026" });
  check("ITJ01 附件六个", itj.notices.length, 6);
  check("ITJ01 第一个附件的名字", itj.notices[0]?.title, "Aviso de Audiência Pública nº 07.2026-Antaq");
  check("ITJ01 文档分栏", itj.documentSections.map((d) => d.title), ["Diretrizes do projeto", "Minutas de Edital e Contrato", "EVTEA"]);
}

const vdc = parsed.find((p) => p.file.startsWith("04-"))?.hearing;
if (vdc) {
  check("VDC04 场次号", vdc.number, "04/2026");
  check("VDC04 港区代码", vdc.projectCode, "VDC04");
  check("VDC04 附件九个", vdc.notices.length, 9);
  // Plone serves this one with a trailing slash after `.pdf`. An
  // end-anchored extension check dropped it, which is how a real document
  // goes missing without anything failing.
  check("VDC04 最后一个附件（地址是 .pdf/ 带尾斜杠的那个）", vdc.notices[8]?.title, "Relatório de Contribuições ao Projeto VDC04");
  // The reason `contributionsDeadline` is read from the `até … dia` sentence
  // and not from `no período de X a Y`: this page carries that phrase twice
  // and the first belongs to an earlier round, dated 2024.
  check("VDC04 截止日期取的是「até … dia」那句，不是页面上更早的那个 2024", vdc.contributionsDeadline, "2026-07-03");
}

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
