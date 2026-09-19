/**
 * Saves the ANTAQ hearing pages as bytes, so the mapper is written from the
 * real HTML rather than from a description of it.
 *
 * This repo's rule, recorded in lib/ingestion/README.md and paid for three
 * times (Compras MX, Ecopetrol, Proyectos México): a person obtains the file,
 * and the mapper is written against the real capture. ANTAQ is reachable from
 * a runner and from Vercel but not from here — every `.gov.br` host is outside
 * this sandbox's allowlist — so the capture step runs on the runner and the
 * bytes come back as a workflow artifact.
 *
 * It follows the "em andamento" link rather than guessing its slug, for the
 * reason written up in brazil-pipeline-dig.ts: a guessed slug that 404s reads
 * as "there are no live hearings".
 *
 * Read-only. No Supabase, no writes to anything but `exports/`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { collectLinks, isInteresting } from "@/lib/ingestion/brazil-behind-doors";

const INDEX = "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas";
const OUT_DIR = "exports/antaq";
/**
 * Where the committed sample lives. The raw pages go to `exports/` as an
 * artifact, but an artifact expires and cannot be reached from the sandbox
 * the parser is written in (Azure blob storage is outside its allowlist), so
 * the sample that the parser is actually written against is committed — the
 * same posture as `aneel-edital-transmissao-2026.html` next to it.
 */
const FIXTURE_DIR = "lib/ingestion/__fixtures__/antaq";
const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** How many hearings to capture. Enough shapes to write a parser, few enough to read. */
const HOW_MANY = 5;

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

/**
 * The content region, without the Plone chrome.
 *
 * `aneel-edital-transmissao-2026.html` is committed whole because it is 8KB.
 * An ANTAQ hearing page is 180KB, nearly all of it the gov.br header, mega
 * menu, cookie banner and footer, repeated identically on every page. Five of
 * those would put nearly a megabyte of navigation into the repository to
 * preserve about 15KB that a parser reads. So the sample keeps the content
 * region and says so, rather than being quietly cut somewhere arbitrary.
 */
function trimToContent(html: string, url: string): string {
  const regions = [
    /<main\b[\s\S]*?<\/main>/i,
    /<article\b[\s\S]*?<\/article>/i,
    /<div[^>]*\bid=["']content["'][\s\S]*?<\/div>\s*<\/div>/i,
  ];
  const body = regions.map((r) => r.exec(html)?.[0]).find((m) => m !== undefined && m.length > 500);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1].trim() ?? "";
  const note = [
    "<!--",
    "  ANTAQ 公开听证页 —— 只保留正文区域，gov.br 的页头/巨型菜单/页脚已裁掉。",
    `  原页 ${Math.round(html.length / 1024)}KB，这里 ${body ? Math.round(body.length / 1024) : "?"}KB。`,
    `  来源：${url}`,
    `  抓取：${new Date().toISOString().slice(0, 10)}（npm run capture:antaq，在 GitHub Actions 跑批机上）`,
    "  重抓：Actions → Probe Brazil doors → what=capture",
    "-->",
  ].join("\n");
  return `${note}\n<title>${title}</title>\n${body ?? html.slice(0, 60_000)}\n`;
}

function safeName(url: string): string {
  return (new URL(url).pathname.split("/").filter((s) => s !== "").pop() ?? "page").replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(FIXTURE_DIR, { recursive: true });

  async function keep(name: string, html: string, url: string) {
    await writeFile(`${OUT_DIR}/${name}`, html);
    const trimmed = trimToContent(html, url);
    await writeFile(`${FIXTURE_DIR}/${name}`, trimmed);
    console.log(`  ${name}  原 ${Math.round(html.length / 1024)}KB → 样本 ${Math.round(trimmed.length / 1024)}KB`);
  }

  const indexHtml = await get(INDEX);
  await keep("00-index.html", indexHtml, INDEX);

  const live = collectLinks(indexHtml, INDEX).find((l) => /em\s+andamento/i.test(l.text));
  if (live === undefined) throw new Error("索引页上没有「em andamento」那条链接 —— 页面结构变了，先看 00-index.html");

  const liveHtml = await get(live.href);
  await keep("01-em-andamento.html", liveHtml, live.href);

  const hearings = collectLinks(liveHtml, live.href)
    .filter((l) => isInteresting(l) && /audi[êe]ncia\s+p[úu]blica\s+n/i.test(l.text) && l.host === "www.gov.br")
    .slice(0, HOW_MANY);
  console.log(`gov.br 上的听证 ${hearings.length} 场`);

  for (const [i, hearing] of hearings.entries()) {
    try {
      const html = await get(hearing.href);
      console.log(`  ${hearing.text.slice(0, 70)}`);
      await keep(`${String(i + 2).padStart(2, "0")}-${safeName(hearing.href)}.html`, html, hearing.href);
    } catch (err) {
      console.log(`  ${hearing.text.slice(0, 70)} → 取不到：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n样本写在 ${FIXTURE_DIR}/，workflow 会提交回分支；完整原页在 ${OUT_DIR}/，作为 artifact。`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
