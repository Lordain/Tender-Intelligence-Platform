/**
 * The ANTAQ connector's decisions, made testable by keeping them out of the
 * fetch.
 *
 * Nothing here touches the network — every .gov.br host is outside this
 * sandbox's egress allowlist, and a test that can only run on a runner is a
 * test that stops being run. So the two things the connector actually decides
 * are asserted against the committed capture instead:
 *
 *   1. Host triage. Six of ANTAQ's twenty listed hearings are readable. If
 *      that ratio moves, this source's coverage moved, and a count is the
 *      only way anyone notices.
 *   2. Which links become downloadable documents. The `Comunicados` PDFs do;
 *      the `Documentação` landing pages must NOT, or the download button
 *      hands a subscriber an HTML page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseAntaqHearing } from "@/lib/ingestion/antaq-audiencia-parser";
import { classifyAntaqHost, hearingDocumentLinks, triageHearingLinks } from "@/lib/ingestion/connectors/antaq-live";

const DIR = "lib/ingestion/__fixtures__/antaq";
const LIVE_INDEX =
  "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas/audiencias-publicas-em-andamento";

let ran = 0;
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  ran += 1;
  const okay = JSON.stringify(actual) === JSON.stringify(expected);
  if (!okay) failures += 1;
  console.log(`${okay ? "✓" : "✗"} ${name}${okay ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}
function ok(name: string, condition: boolean, detail = "") {
  check(`${name}${detail === "" ? "" : ` ${detail}`}`, condition, true);
}

console.log("── 域名分诊 ──");
check("gov.br 能读", classifyAntaqHost("www.gov.br").verdict, "readable");
check("leilao.antaq 明确拒绝我们", classifyAntaqHost("leilao.antaq.gov.br").verdict, "refuses-us");
check("portal.antaq 也是", classifyAntaqHost("portal.antaq.gov.br").verdict, "refuses-us");
// Still not "refuses-us" after the 2026-09-20 capture attempt, and the reason
// is narrower than it was: of the three hearings tried from the runner, only
// one was an actual block (Cloudflare challenge) and two were 502s — ANTAQ's
// own server not answering, which is not a decision about us. One machine has
// voted. Conflating the two verdicts would make "write a parser" look like
// "change where the request comes from", and they are different jobs.
check("sisapinternet 是另一套系统，不是拒绝", classifyAntaqHost("sisapinternet.antaq.gov.br").verdict, "other-system");
ok("但它的理由里记着 2026-09-20 那次实测", /2026-09-20/.test(classifyAntaqHost("sisapinternet.antaq.gov.br").why));
check("没见过的域名不假装能读", classifyAntaqHost("example.org").verdict, "other-system");
check("空 host 也不假装能读", classifyAntaqHost("").verdict, "other-system");
ok("每个判断都带一句为什么", ["www.gov.br", "leilao.antaq.gov.br", "sisapinternet.antaq.gov.br", "x"].every((h) => classifyAntaqHost(h).why.length > 5));

console.log("\n── 进行中列表的分诊（照着真实抓取的那一页）──");
const triage = triageHearingLinks(readFileSync(`${DIR}/01-em-andamento.html`, "utf8"), LIVE_INDEX);
check("列出 20 场", triage.listed.length, 20);
check("能读的 6 场", triage.readable.length, 6);
check("没去取的 14 场", triage.skipped.length, 14);
check("读的 + 跳的 = 列出的", triage.readable.length + triage.skipped.length, triage.listed.length);
check("跳过的按域名分：sisapinternet 11 场", triage.skipped.filter((s) => s.host === "sisapinternet.antaq.gov.br").length, 11);
check("跳过的按域名分：leilao 3 场", triage.skipped.filter((s) => s.host === "leilao.antaq.gov.br").length, 3);
ok("能读的全在 www.gov.br 上", triage.readable.every((l) => new URL(l.url).host === "www.gov.br"));
ok("链接都是绝对地址", triage.listed.every((l) => l.url.startsWith("http")));
ok("每场跳过的都说得出理由", triage.skipped.every((s) => s.why.length > 5 && s.title.length > 0));
// The reason the ingest script applies its own window instead of trusting the
// page's name: "em andamento" is ANTAQ's archive. One of its entries points
// straight at a URL with `audiencias-encerradas` in the path.
ok("「进行中」这一页其实连已结束的也列（所以窗口得自己设）", triage.listed.some((l) => /encerrad/i.test(l.url)), `→ ${triage.listed.filter((l) => /encerrad/i.test(l.url)).length} 条`);
ok("列表里有 2022 年的场次", triage.listed.some((l) => /2022/.test(l.title)));

console.log("\n── 公告附件 → 文档链接 ──");
const hearingFiles = readdirSync(DIR).filter((f) => f.endsWith(".html") && !f.startsWith("00-") && !f.startsWith("01-")).sort();
const hearings = hearingFiles
  .map((file) => ({ file, hearing: parseAntaqHearing(readFileSync(`${DIR}/${file}`, "utf8"), `https://www.gov.br/${file}`) }))
  .filter((h): h is { file: string; hearing: NonNullable<ReturnType<typeof parseAntaqHearing>> } => h.hearing !== null);
check("五份页面都解析出来了", hearings.length, 5);

for (const { file, hearing } of hearings) {
  const links = hearingDocumentLinks(hearing);
  const tag = file.slice(0, 22);
  check(`${tag} 附件条数和解析结果一致`, links.length, hearing.notices.length);
  ok(`${tag} 每条都有下载地址和文件名`, links.every((l) => l.sourceUrl.startsWith("https://") && l.fileName.length > 0));
  ok(`${tag} 文件名不含 Windows 禁用字符`, links.every((l) => !/[\\/:*?"<>|]/.test(l.fileName)));
  // The whole point of separating these from `documentSections`: a landing
  // page written into tender_document_links puts HTML behind a download
  // button. None of the section URLs may appear here.
  const sectionUrls = new Set(hearing.documentSections.map((s) => s.url));
  ok(`${tag} 文档分栏的落地页没混进来`, links.every((l) => !sectionUrls.has(l.sourceUrl)), `（分栏 ${sectionUrls.size} 个）`);
  ok(`${tag} 格式是从地址里读的，不是从标题猜的`, links.every((l) => l.format === undefined || /^[a-z0-9]{2,5}$/.test(l.format)));
}

const vdc = hearings.find((h) => h.file.startsWith("04-"))!.hearing;
const vdcLinks = hearingDocumentLinks(vdc);
check("VDC04 九个附件", vdcLinks.length, 9);
// Plone serves this one as `…/vdc04_contribuies_publico.pdf/` — extension
// followed by a slash, not by the end of the string. An end-anchored read
// leaves `format` empty, which is how a real PDF stops looking like one.
check("VDC04 最后一个（地址 .pdf 后面还有斜杠）格式仍读成 pdf", vdcLinks[8]?.format, "pdf");
ok("VDC04 九个附件格式全读出来了", vdcLinks.every((l) => l.format !== undefined), `→ ${[...new Set(vdcLinks.map((l) => l.format))].join("/")}`);

const itj = hearings.find((h) => h.file.startsWith("02-"))!.hearing;
check("ITJ01 第一个附件的文件名", hearingDocumentLinks(itj)[0]?.fileName, "Aviso de Audiência Pública nº 07.2026-Antaq");

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
