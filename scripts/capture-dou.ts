/**
 * Asks the DOU what it actually serves, and keeps the bytes.
 *
 * WHY THIS SOURCE IS WORTH ASKING ABOUT. Brazilian law requires every federal
 * tender notice, edital and award to be published in the Diário Oficial da
 * União, which makes it the one Brazilian source that is complete by statute
 * rather than by an agency's choice to publish. This platform already runs
 * the same shape for Mexico: lib/ingestion/connectors/dof-search-live.ts
 * searches the DOF and maps the notices out of it, and that connector is how
 * CFE and PEMEX notices reach the feed at all.
 *
 * And the door is open. `in.gov.br/leiturajornal?secao=do3` answered both
 * Vercel and the GitHub runner on 2026-09-19 (door B4, 135KB, 57 links) while
 * refusing the user's laptop — the same egress split as every other Brazilian
 * host measured this week.
 *
 * WHAT THIS DOES NOT ASSUME. Whether the page carries structured data, and in
 * what shape, is not something to recall — the DOF connector was written from
 * a real "Copy as cURL" capture for exactly this reason, and its header says
 * the real response shape was confirmed from actual server output rather than
 * guessed. So this knocks a handful of DOU URLs, prints what each returns,
 * and writes the bytes into __fixtures__/dou/ where a parser can be written
 * against them.
 *
 * The embedded JSON gets its own file. `leiturajornal` is a server-rendered
 * page whose real payload is a JSON blob inside a <script> tag; trimming to
 * the content region the way the ANTAQ capture does would throw away the only
 * part worth having.
 *
 * Read-only. No Supabase, no model calls, no writes outside exports/ and the
 * fixture directory.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";

const OUT_DIR = "exports/dou";
const FIXTURE_DIR = "lib/ingestion/__fixtures__/dou";
const TIMEOUT_MS = 25_000;

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Brazilian day format, which is what leiturajornal's `data` parameter takes. */
function brDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

/**
 * The most recent weekday. The DOU publishes on business days; asking for a
 * Sunday returns an empty edition, which would read as "this source is empty".
 */
function lastWeekday(now: Date): Date {
  const d = new Date(now);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const TODAY = lastWeekday(new Date());

type Door = { id: string; what: string; url: string; keep?: string };

const DOORS: Door[] = [
  // Seção 3 is where contracts, editais and avisos de licitação are published.
  { id: "D1", what: "DOU 第三节（合同与招标）—— 当期", url: "https://www.in.gov.br/leiturajornal?secao=do3", keep: "do3-hoje.html" },
  { id: "D2", what: "DOU 第三节 —— 指定日期（看 data 参数认不认）", url: `https://www.in.gov.br/leiturajornal?data=${brDate(TODAY)}&secao=do3`, keep: "do3-data.html" },
  // Seção 1 carries the acts themselves: the decrees and portarias that grant
  // a concession or authorise an auction. A tender notice says a competition
  // is open; a Seção 1 act is often the earlier signal that one is coming.
  { id: "D3", what: "DOU 第一节（法令与授权）", url: "https://www.in.gov.br/leiturajornal?secao=do1", keep: "do1-hoje.html" },
  // The search is the DOF analogue: keyword + section + date range.
  { id: "D4", what: "DOU 全文检索 —— 「concessão」", url: "https://www.in.gov.br/consulta/-/buscar/dou?q=concess%C3%A3o&s=todos", keep: "busca-concessao.html" },
  { id: "D5", what: "DOU 全文检索 —— 「aviso de licitação」限第三节", url: "https://www.in.gov.br/consulta/-/buscar/dou?q=aviso+de+licita%C3%A7%C3%A3o&s=do3", keep: "busca-licitacao.html" },
  { id: "D6", what: "Imprensa Nacional 开放数据页（有没有批量下载）", url: "https://www.in.gov.br/acesso-a-informacao/dados-abertos" },
];

async function knock(door: Door): Promise<{ door: Door; verdict: string; detail: string; ms: number; body?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(door.url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    const text = await response.text();
    const ms = Date.now() - started;
    if (!response.ok) return { door, ms, verdict: `拒绝 ${response.status}`, detail: pageTitle(text) || visibleText(text).slice(0, 110) || "（空正文）" };
    const blocked = blockPageReason(text);
    if (blocked !== null) return { door, ms, verdict: "200 但是拦截页", detail: `「${blocked}」` };
    return {
      door,
      ms,
      verdict: "通了 ★",
      detail: `${Math.round(text.length / 1024)}KB · 正文 ${visibleText(text).length} 字 · ${(text.match(/<a\b[^>]*href="/gi) ?? []).length} 个链接${pageTitle(text) ? ` · ${pageTitle(text)}` : ""}`,
      body: text,
    };
  } catch (err) {
    return { door, ms: Date.now() - started, verdict: "连不上", detail: describeFetchFailure(err).slice(0, 180) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every JSON blob the page carries, described rather than parsed into a
 * shape this script decided on in advance.
 *
 * The question is what keys the DOU actually publishes per item, and a
 * describer that already knows the answer cannot discover it is wrong.
 */
function describeEmbeddedJson(html: string): { label: string; json: string }[] {
  const found: { label: string; json: string }[] = [];
  // Both the shapes a Liferay/React page uses: a typed script tag, and a
  // bare assignment to a global.
  const patterns: [string, RegExp][] = [
    ["script[type=application/json]", /<script[^>]*type="application\/json"[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/script>/gi],
    ["window.<var> = {…}", /<script[^>]*>\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*(\{[\s\S]{200,}?\}|\[[\s\S]{200,}?\])\s*;?\s*<\/script>/gi],
    ["<input value=json>", /<input[^>]*id="([^"]*)"[^>]*value="(\{&quot;[\s\S]*?)"/gi],
  ];
  for (const [label, pattern] of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = (match[2] ?? "").trim();
      if (raw.length < 200) continue;
      found.push({ label: `${label}${match[1] ? ` #${match[1]}` : ""}`, json: raw });
    }
  }
  return found;
}

function topKeys(raw: string): string {
  const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      return `数组 ${parsed.length} 项${first && typeof first === "object" ? `，每项的键：${Object.keys(first as object).slice(0, 20).join(" / ")}` : ""}`;
    }
    if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const keys = Object.keys(obj);
      const arrays = keys.filter((k) => Array.isArray(obj[k])).map((k) => `${k}[${(obj[k] as unknown[]).length}]`);
      return `对象，键：${keys.slice(0, 20).join(" / ")}${arrays.length > 0 ? `　数组字段：${arrays.join(" ")}` : ""}`;
    }
    return "既不是对象也不是数组";
  } catch (err) {
    return `解析不了（${err instanceof Error ? err.message.slice(0, 60) : "?"}）—— 前 160 字：${decoded.slice(0, 160)}`;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(FIXTURE_DIR, { recursive: true });
  const where = process.argv.slice(2).join(" ").trim() || "本机";

  const lines: string[] = [
    `DOU（巴西联邦官方公报）—— 从【${where}】这一侧`,
    "",
    "问的是三件事：够不够得着、页面里有没有结构化数据、那数据够不够写 mapper。",
    `取的是最近一个工作日：${brDate(TODAY)}`,
    "",
    "────────────────────────────────────────────────────────────────────────",
    "",
  ];

  for (const door of DOORS) {
    const result = await knock(door);
    lines.push(`${result.door.id}  ${result.door.what}`, `    ${result.door.url}`, `    ${result.verdict.padEnd(14)} ${String(result.ms).padStart(5)}ms  ${result.detail}`);

    if (result.body !== undefined && door.keep !== undefined) {
      await writeFile(`${OUT_DIR}/${door.keep}`, result.body);
      const blobs = describeEmbeddedJson(result.body);
      if (blobs.length === 0) {
        lines.push(`    页面里没找到内嵌 JSON —— 只能按 HTML 解析`);
      } else {
        lines.push(`    内嵌 JSON ${blobs.length} 块：`);
        for (const [i, blob] of blobs.entries()) {
          lines.push(`      ${i + 1}. ${blob.label}　${Math.round(blob.json.length / 1024)}KB`, `         ${topKeys(blob.json)}`);
          // Written whole rather than truncated: the column contract is the
          // point, and a JSON file cut in the middle cannot be parsed by the
          // test that will read it.
          const name = `${door.keep.replace(/\.html$/, "")}-json-${i + 1}.json`;
          const decoded = blob.json.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          try {
            await writeFile(`${FIXTURE_DIR}/${name}`, JSON.stringify(JSON.parse(decoded), null, 2));
            lines.push(`         → ${FIXTURE_DIR}/${name}`);
          } catch {
            await writeFile(`${FIXTURE_DIR}/${name}.txt`, decoded);
            lines.push(`         → ${FIXTURE_DIR}/${name}.txt（原样存，解析不了）`);
          }
        }
      }
    }
    lines.push("");
  }

  lines.push(
    "────────────────────────────────────────────────────────────────────────",
    "",
    "判断标准：有每条公告的标题、机构、日期和可点开的链接，才算能建连接器。",
    "只有一张当天的版面图或一堆 PDF，不算。",
  );
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
