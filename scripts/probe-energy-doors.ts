/**
 * Can the machine that runs the imports reach the power, oil and mining
 * companies' own procurement sites that the agent sandbox cannot?
 *
 * On 2026-09-25 the sandbox reached Petronect, UPME, Codelco, ENAP, ISA and
 * EPM, and got nothing from these: the Coordinador Eléctrico Nacional
 * (Cloudflare challenge), ENAMI, Petroperú, ProInversión, Electroperú and
 * Perupetro (connection refused by the sandbox's own egress). A refusal there
 * says nothing about the sites, so this asks the GitHub runner — the machine
 * a connector would actually run on — before anything is built against them.
 *
 * For each URL: status, bytes, time, page title, whether it is a block page,
 * and how often the words that mean "a tender is here" appear, so an open
 * page with nothing behind it reads differently from a list of tenders.
 *
 * Read-only. No Supabase, no writes.
 *
 * Usage: npm run probe:energy-doors -- "GitHub Actions 跑批机"
 */
import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";

const TARGETS: [string, string][] = [
  ["智利 Coordinador Eléctrico 首页", "https://www.coordinador.cl/"],
  ["智利 Coordinador 输电工程招标", "https://www.coordinador.cl/desarrollo/documentos/licitaciones/"],
  ["智利 ENAMI 首页", "https://www.enami.cl/"],
  ["智利 ENAMI 供应商", "https://www.enami.cl/proveedores/"],
  ["秘鲁 Petroperú 首页", "https://www.petroperu.com.pe/"],
  ["秘鲁 Petroperú 供应商", "https://www.petroperu.com.pe/proveedores/"],
  ["秘鲁 Petroperú 采购流程", "https://procesos.petroperu.com.pe/"],
  ["秘鲁 ProInversión 首页", "https://www.proinversion.gob.pe/"],
  ["秘鲁 ProInversión（Invest in Peru）", "https://www.investinperu.pe/"],
  ["秘鲁 ProInversión（gob.pe）", "https://www.gob.pe/proinversion"],
  ["秘鲁 Electroperú", "https://www.electroperu.com.pe/"],
  ["秘鲁 Perupetro", "https://www.perupetro.com.pe/"],
  ["巴西 Cemig e-Compras 接口", "https://api-manager-compras.cemig.com.br/"],
];

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-419,es;q=0.9,pt-BR;q=0.8",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TENDER_WORDS = /licitaci[oó]n|licita[çc][ãa]o|convocatoria|concurso|proceso de (?:selecci[oó]n|contrataci[oó]n)|proveedores|cartera de proyectos|edital/gi;

async function knock(label: string, url: string): Promise<void> {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(25_000) });
    const body = await response.text();
    const ms = Date.now() - started;
    const blocked = blockPageReason(body);
    const hits = (visibleText(body).match(TENDER_WORDS) ?? []).length;
    console.log(
      `${response.ok && !blocked ? "✅" : "⚠️ "} ${label}\n    ${response.status} · ${body.length} 字节 · ${ms}ms · ${response.url}\n` +
        `    标题：${pageTitle(body) || "（无）"}${blocked ? `\n    拦截页：${blocked}` : ""}\n    「招标」相关词出现 ${hits} 次`,
    );
  } catch (err) {
    console.log(`❌ ${label}\n    ${url}\n    ${describeFetchFailure(err)} · ${Date.now() - started}ms`);
  }
}

async function main() {
  console.log(`能源/矿业公司采购网站可达性 —— ${process.argv[2] ?? "本机"}，${new Date().toISOString()}\n`);
  for (const [label, url] of TARGETS) await knock(label, url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
