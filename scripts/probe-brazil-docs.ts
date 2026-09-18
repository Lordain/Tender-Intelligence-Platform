/**
 * Does PNCP hand over the bid documents, or does a reader have to fetch them
 * one by one from the portal?
 *
 * The question this answers is not "is there a documents endpoint" — it is
 * whether the FILES behind it can be downloaded by a machine with no session,
 * because that is the difference between this platform showing a 附件 list and
 * telling every reader to go and click through pncp.gov.br themselves.
 *
 * So it probes in two stages, and the second is the one that matters:
 *
 *  1. The metadata list, at the sibling path of the one that already works
 *     for amounts: /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos.
 *     GUESSED, not documented — the same guess that cost two wrong turns on
 *     dadosabertos earlier this week, which is why a 404 here is reported as
 *     "wrong path, keep looking" and never as "PNCP has no documents".
 *  2. The first file's own URL, fetched for real. A metadata list whose links
 *     need a login, a cookie or a referer is worth nothing to an importer,
 *     and only a request finds that out. Content-Type and Content-Length come
 *     back so an HTML login page cannot pass as a PDF.
 *
 * Read-only. No Supabase, no writes, no model calls. Run it from a machine
 * that can reach pncp.gov.br — this sandbox cannot.
 *
 * Usage:
 *   npm run probe:brazil-docs -- --item-url /compras/57356434000146/2026/66
 *   npm run probe:brazil-docs -- --cnpj 57356434000146 --ano 2026 --seq 66
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const BASE = "https://pncp.gov.br/api/pncp/v1/orgaos";
const TIMEOUT_MS = 60_000;

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

type Fetched = { ok: boolean; status: number | string; ms: number; text: string; contentType: string; contentLength: string };

async function get(url: string, accept: string): Promise<Fetched> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { ...HEADERS, Accept: accept }, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      text,
      contentType: response.headers.get("content-type") ?? "",
      contentLength: response.headers.get("content-length") ?? String(text.length),
    };
  } catch (err) {
    return { ok: false, status: describeFetchFailure(err), ms: Date.now() - started, text: "", contentType: "", contentLength: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const itemUrl = argValue(args, "--item-url");
  let cnpj = argValue(args, "--cnpj");
  let ano = argValue(args, "--ano");
  let seq = argValue(args, "--seq");

  if (itemUrl) {
    const match = /\/compras\/(\d{14})\/(\d{4})\/(\d+)/.exec(itemUrl);
    if (!match) {
      // Never echo the placeholder back as the fix — that mistake shipped in
      // probe:brazil-amount and read as gibberish.
      console.error(`--item-url 认不出来："${itemUrl}"`);
      console.error(`要的是从搜索结果里复制的那个真实路径，形如 /compras/57356434000146/2026/66`);
      console.error(`（14 位 CNPJ / 4 位年份 / 序号，三段都得是数字）`);
      process.exit(1);
    }
    [, cnpj, ano, seq] = match;
  }
  if (!cnpj || !ano || !seq) {
    console.error("给一个项目：--item-url /compras/<CNPJ>/<年>/<序号>，或者 --cnpj --ano --seq 三个分开给。");
    process.exit(1);
  }

  const listUrl = `${BASE}/${cnpj}/compras/${ano}/${seq}/arquivos`;
  console.log(`项目：${cnpj} / ${ano} / ${seq}\n`);
  console.log(`① 附件清单（路径是推测的，不是文档里查到的）`);
  console.log(`   ${listUrl}`);

  const list = await get(listUrl, "application/json");
  console.log(`   ${list.ok ? "OK" : "FAIL"} ${list.status}　${list.ms}ms　${list.contentType || "(无 content-type)"}`);

  if (!list.ok) {
    if (list.status === 404) {
      console.log(`\n   404 的意思是这个路径猜错了，不是「PNCP 没有附件」—— 这两件事差很远。`);
      console.log(`   下一步别再猜第三次：去 https://pncp.gov.br 打开这个项目，用浏览器开发者工具的 Network 面板`);
      console.log(`   看点「下载」时它实际请求了哪个地址，把那个地址告诉我。`);
    }
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(list.text);
  } catch {
    console.log(`\n   返回的不是 JSON。前 200 个字符：\n   ${list.text.slice(0, 200)}`);
    process.exit(1);
  }

  const files = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: unknown[] }).items : null;
  if (!files) {
    console.log(`\n   认不出这个形状。原样打印：\n${JSON.stringify(parsed, null, 2).slice(0, 1200)}`);
    process.exit(1);
  }

  console.log(`   ${files.length} 个附件。第一个的完整字段：\n`);
  console.log(JSON.stringify(files[0], null, 2).slice(0, 1200));

  // Every key whose value looks like a URL — rather than assuming the field is
  // called `url`, which is how the last two shape guesses went wrong.
  const first = files[0] as Record<string, unknown>;
  const urlKeys = Object.entries(first)
    .filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v))
    .map(([k, v]) => [k, v as string] as const);

  console.log(`\n   看起来是链接的字段：${urlKeys.length === 0 ? "一个都没有" : urlKeys.map(([k]) => k).join("、")}`);
  for (const [key, value] of urlKeys) console.log(`     ${key} = ${value}`);

  if (urlKeys.length === 0) {
    console.log(`\n   没有绝对链接。可能是只给了个相对路径或者文件 id —— 把上面那段 JSON 贴给我，我来看怎么拼。`);
    return;
  }

  console.log(`\n② 真的去下第一个文件 —— 光有链接不算数，要看它认不认没有登录态的请求`);
  const [, fileUrl] = urlKeys[0];
  console.log(`   ${fileUrl}`);
  const file = await get(fileUrl, "*/*");
  console.log(`   ${file.ok ? "OK" : "FAIL"} ${file.status}　${file.ms}ms`);
  console.log(`   Content-Type:   ${file.contentType || "(无)"}`);
  console.log(`   Content-Length: ${file.contentLength}`);

  const looksLikeHtml = /text\/html/i.test(file.contentType) || /^\s*<(!doctype|html)/i.test(file.text);
  if (!file.ok) {
    console.log(`\n   拿不到文件。附件得靠人工下载 —— 和秘鲁一样，前台只能给检索指引。`);
  } else if (looksLikeHtml) {
    // A 200 that is a login or error page is the failure most likely to be
    // mistaken for success, so it gets its own verdict rather than passing.
    console.log(`\n   ⚠ 返回 200，但内容是 HTML，不是文件 —— 多半是登录页或错误页。`);
    console.log(`   这种「假成功」最容易被当成能用，所以单独判一次。附件仍然算拿不到。`);
  } else {
    console.log(`\n   ✅ 没有登录态也能直接下载。附件可以远程批量取，接进现有的文档管线。`);
    console.log(`   （ingest-tender-documents.ts / extract-tender-document.ts 已经在跑哥伦比亚和秘鲁的了）`);
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
