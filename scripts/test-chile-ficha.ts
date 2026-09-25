/**
 * The ficha and attachment-index parsers, against bytes Mercado Público really
 * served on 2026-09-24.
 *
 * The case this file exists for is `attachment-wrong-base.html`: a 200 that
 * carries 32 keycloak references and a login page, returned when the ficha's
 * relative `../Attachment/…` href is resolved one directory too high. That
 * response was reported to the user as "the attachments require a ChileCompra
 * account" before the two URLs were compared. It is a fixture now so the wrong
 * conclusion cannot be reached twice.
 *
 * Usage: npm run test:chile-ficha
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHILE_MODULES_BASE,
  chileAttachmentIndexRefusal,
  parseChileAttachmentIndex,
  parseChileFichaAttachmentUrls,
  parseChileFichaClosingDate,
  parseChileViewState,
  resolveChileAttachmentUrl,
} from "@/lib/ingestion/chile-ficha-parser";

const FIXTURES = path.join(process.cwd(), "lib/ingestion/__fixtures__/chile");
const read = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

let passed = 0;
const failures: string[] = [];

function check(what: string, condition: boolean, detail?: string): void {
  if (condition) passed += 1;
  else failures.push(`${what}${detail ? ` —— ${detail}` : ""}`);
}

function equal(what: string, actual: unknown, expected: unknown): void {
  check(what, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，拿到 ${JSON.stringify(actual)}`);
}

const withAttachments = read("ficha-attachments.html");
const withoutAttachments = read("ficha-no-attachments.html");
const index = read("attachment-index.html");
const wrongBase = read("attachment-wrong-base.html");

// ── closing date ─────────────────────────────────────────────────────────
equal("ficha 交标截止日", parseChileFichaClosingDate(withAttachments), { date: "2026-09-30", time: "17:00:00" });
equal("无附件的 ficha 也有截止日", parseChileFichaClosingDate(withoutAttachments)?.date, "2026-10-16");
// dd-mm-yyyy, not mm-dd-yyyy: 30 is not a month.
check("30-09-2026 读成 9 月 30 日", parseChileFichaClosingDate(withAttachments)?.date === "2026-09-30");
equal("没有 lblCierre 就返回 undefined", parseChileFichaClosingDate("<html><body>nada</body></html>"), undefined);
equal("31-02 这种不存在的日期被拒", parseChileFichaClosingDate('<span id="lblCierre">31-02-2026 10:00:00</span>'), undefined);
equal("只有日期没有时间也能读", parseChileFichaClosingDate('<span id="lblCierre">05-11-2026</span>'), { date: "2026-11-05" });

// ── the wrong-base trap ──────────────────────────────────────────────────
equal(
  "相对链接解析成 Modules/Attachment/",
  resolveChileAttachmentUrl("../Attachment/VerAntecedentes.aspx?enc=ABC%2b123"),
  `${CHILE_MODULES_BASE}Attachment/VerAntecedentes.aspx?enc=ABC%2b123`,
);
check("解析结果里有 Modules/", resolveChileAttachmentUrl("../Attachment/VerAntecedentes.aspx?enc=X").includes("/Procurement/Modules/Attachment/"));
check("&amp; 会被还原", resolveChileAttachmentUrl("../Attachment/VerAntecedentes.aspx?enc=A&amp;b=1").endsWith("enc=A&b=1"));
let threw = false;
try {
  resolveChileAttachmentUrl("/Procurement/Attachment/VerAntecedentes.aspx?enc=X");
} catch {
  threw = true;
}
check("形状不对的链接直接抛错，而不是拼一个出来", threw);

check("真附件页没有被误判为登录页", chileAttachmentIndexRefusal(index) === undefined);
const refusal = chileAttachmentIndexRefusal(wrongBase);
check("少一层目录的 200 被认出是登录落地页", refusal !== undefined && refusal.includes("登录落地页"), refusal ?? "(没有拒绝)");
check("拒绝信息点出真正的原因是 URL 少了 Modules", (refusal ?? "").includes("/Procurement/Modules/Attachment/"));
check("拒绝信息报出 keycloak 次数", /keycloak 出现 32 次/.test(refusal ?? ""), refusal ?? "");

// ── the attachment index ─────────────────────────────────────────────────
const files = parseChileAttachmentIndex(index);
equal("附件表读出 1 个文件", files.length, 1);
equal("文件名", files[0]?.fileName, "Formularios Administrativos.docx");
equal("买方分类", files[0]?.documentType, "Anexos Administrativos de Adquisición");
equal("买方备注", files[0]?.description, "Anexo Administrativo");
equal("发布日 dd-mm-yyyy 转 ISO", files[0]?.publishedAt, "2026-09-23");
equal("回发控件名", files[0]?.control, "grdAttachment$ctl02$grdIbtnView");
equal("登录落地页读不出文件", parseChileAttachmentIndex(wrongBase).length, 0);

// ── ficha → attachment index links ───────────────────────────────────────
const urls = parseChileFichaAttachmentUrls(withAttachments);
equal("ficha 上有 3 个附件页链接（6 处 href，去重后 3）", urls.length, 3);
check("每个都指向 Modules/Attachment/", urls.every((u) => u.startsWith(`${CHILE_MODULES_BASE}Attachment/`)));
// 27 of 60 kept rows on 2026-09-24 publish their whole bases as ficha text and
// attach no files at all. That is a fact about the tender, not a failed fetch.
equal("没有附件的 ficha 返回空数组", parseChileFichaAttachmentUrls(withoutAttachments), []);

// ── the postback fields ──────────────────────────────────────────────────
const viewState = parseChileViewState(index);
check("附件页有 __VIEWSTATE", (viewState?.viewState.length ?? 0) > 100, `长度 ${viewState?.viewState.length}`);
check("表单 action 指向 VerAntecedentes", viewState?.action.includes("VerAntecedentes.aspx") === true);
check("action 里的 &amp; 已还原", !(viewState?.action ?? "").includes("&amp;"));
equal("ficha 本身不当作附件页解析 viewstate", parseChileViewState("<html></html>"), undefined);

console.log(failures.length === 0 ? `\n✅ 全部通过：${passed} 项\n` : `\n❌ ${failures.length} 项失败（${passed} 项通过）\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
process.exit(failures.length === 0 ? 0 : 1);
