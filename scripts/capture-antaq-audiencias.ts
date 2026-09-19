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

function safeName(url: string): string {
  return (new URL(url).pathname.split("/").filter((s) => s !== "").pop() ?? "page").replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const indexHtml = await get(INDEX);
  await writeFile(`${OUT_DIR}/00-index.html`, indexHtml);
  console.log(`索引页 ${Math.round(indexHtml.length / 1024)}KB → ${OUT_DIR}/00-index.html`);

  const live = collectLinks(indexHtml, INDEX).find((l) => /em\s+andamento/i.test(l.text));
  if (live === undefined) throw new Error("索引页上没有「em andamento」那条链接 —— 页面结构变了，先看 00-index.html");

  const liveHtml = await get(live.href);
  await writeFile(`${OUT_DIR}/01-em-andamento.html`, liveHtml);
  console.log(`在招听证列表 ${Math.round(liveHtml.length / 1024)}KB → ${OUT_DIR}/01-em-andamento.html  (${live.href})`);

  const hearings = collectLinks(liveHtml, live.href)
    .filter((l) => isInteresting(l) && /audi[êe]ncia\s+p[úu]blica\s+n/i.test(l.text) && l.host === "www.gov.br")
    .slice(0, HOW_MANY);
  console.log(`gov.br 上的听证 ${hearings.length} 场`);

  for (const [i, hearing] of hearings.entries()) {
    try {
      const html = await get(hearing.href);
      const name = `${String(i + 2).padStart(2, "0")}-${safeName(hearing.href)}.html`;
      await writeFile(`${OUT_DIR}/${name}`, html);
      console.log(`  ${hearing.text.slice(0, 70)} → ${name} (${Math.round(html.length / 1024)}KB)`);
    } catch (err) {
      console.log(`  ${hearing.text.slice(0, 70)} → 取不到：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\n下一步：把 exports/ 这个 artifact 下下来，对着真实 HTML 写 parser。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
