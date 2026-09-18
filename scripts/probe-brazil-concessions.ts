/**
 * Brazil's other market: concessions and transmission auctions.
 *
 * Everything the Brazil connector currently reads is PNCP — Lei 14.133
 * procurement, where the government buys works and services and pays for
 * them. The two sources this probe knocks on are a different animal entirely,
 * and the difference is not a detail:
 *
 *   **PPI** (ppi.gov.br, Programa de Parcerias de Investimentos) is the
 *   federal concession/PPP pipeline — highways, ports, airports, railways. A
 *   project appears there when the Conselho do PPI qualifies it, which is
 *   typically ONE TO THREE YEARS before any edital exists. It is a portfolio,
 *   not a tender list.
 *
 *   **ANEEL's leilões de transmissão** are auctions for the right to BUILD,
 *   own and operate a transmission line for 30 years. A single lot runs to
 *   billions of reais against the single-digit millions the municipal PNCP
 *   feed carries, and this is the arena the large Chinese utilities actually
 *   compete in.
 *
 * Neither is in PNCP, and neither is reachable from this sandbox — every
 * `.gov.br` host answers 403 at the gateway — so this is a script for the
 * user to run, and its output is what the mappers get written against. That
 * sequencing is not ceremony: the last time this repo guessed a path instead
 * of measuring one, a live host returned 404 in 1.2 seconds and the "finding"
 * was that our URL was wrong (lib/ingestion/README.md, "Brazil — the other
 * doors").
 *
 * ── What each step is actually asking ────────────────────────────────────
 *
 * P. PPI — the single question is **does a machine-readable portfolio exist
 *    at all**, because a gov.br CMS listing may be server-rendered HTML (then
 *    it is scrapeable), a JavaScript shell (then it is not, without a
 *    browser), or a Plone site with plone.restapi quietly enabled (then the
 *    same URL returns JSON just for asking with an Accept header). P1–P3 test
 *    exactly those three, in that order, and P5's sitemap is the cheap way to
 *    enumerate project pages if the answer is "scrapeable".
 *
 *    P6 knocks on the SECTOR AGENCIES instead, and may well matter more than
 *    PPI itself: PPI publishes the pipeline, but the edital for a highway is
 *    published by ANTT, a port by ANTAQ, an airport by ANAC. If one of those
 *    runs an open-data portal with the auction calendar in it, that is a
 *    better door than scraping a portfolio page.
 *
 * E. ANEEL/CCEE — the question is **which portal is CKAN, and what are the
 *    real column names**. E1 confirms the platform rather than assuming it
 *    (`status_show` prints the CKAN version, and a non-CKAN host fails here
 *    instead of producing a confusing error three calls later); E2 searches
 *    for the datasets; E3 is the one that pays, because `datastore_search`
 *    returns the COLUMN CONTRACT of a resource, and a mapper written from
 *    that is written from what the service publishes.
 *
 *    One division of labour worth stating, because it decides which host to
 *    put effort into: **transmission auctions are run by ANEEL** (the edital
 *    is ANEEL's, the auction session is held at B3), while **CCEE runs the
 *    energy/generation auctions** and settles the market. Both are worth
 *    having; only ANEEL answers the question the user asked.
 *
 * ── The one thing measured from here (2026-09-18) ────────────────────────
 *
 * HTTP is blocked but DNS is not, so every hostname below was at least
 * resolved before being written down. That is weaker than a 200 and stronger
 * than recall, and it already caught three of my own guesses:
 *
 *   ppi.gov.br · dados.gov.br · dadosabertos.aneel.gov.br ·
 *   dados.antt.gov.br · dadosabertos.ccee.org.br · portal.antaq.gov.br    存在
 *   web3.antaq.gov.br · dados.antaq.gov.br · dados.anac.gov.br            NXDOMAIN
 *
 * The three NXDOMAINs are why ANTAQ is probed at `portal.antaq.gov.br` and
 * why ANAC is not given a guessed open-data host at all — it is searched for
 * in the national catalogue instead. A probe that spends a step on a hostname
 * that does not exist reports a FAIL that says nothing, and this repo has
 * already mistaken one of those for a finding once.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-concessions
 *   npm run probe:brazil-concessions -- --timeout 180 --rows 8
 */
import { ckanDatastoreSearch, ckanPackageSearch, ckanStatus, type CkanPackage } from "@/lib/ingestion/connectors/ckan";
import { toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";
import { describeFetchFailure } from "@/lib/fetch-failure";

const OUT_DIR = "exports";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const JSON_HEADERS = { ...HEADERS, Accept: "application/json" } as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { label: string; ok: boolean; status: number | string; ms: number; note: string };
const outcomes: Outcome[] = [];

function record(outcome: Outcome): Outcome {
  outcomes.push(outcome);
  console.log(`   ${outcome.ok ? "OK  " : "FAIL"}  ${String(outcome.status).padEnd(14)} ${String(outcome.ms).padStart(7)}ms  ${outcome.note}`);
  console.log();
  return outcome;
}

async function fetchText(url: string, timeoutMs: number, headers: Record<string, string> = HEADERS): Promise<{ status: number | string; ms: number; text: string; failure?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    return { status: response.status, ms: Date.now() - started, text: await response.text() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败",
      ms: Date.now() - started,
      text: "",
      failure: describeFetchFailure(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-rendered page or JavaScript shell?
 *
 * The distinction decides whether a scraper is possible at all, and it is not
 * visible from the status code — a React app answers 200 with a nearly empty
 * body and every link arriving later by fetch. Counting anchors in the
 * returned bytes is the whole test: a CMS listing has dozens, a shell has a
 * handful of nav links or none.
 */
function describeHtml(text: string, linkPattern: RegExp): { note: string; links: string[] } {
  const anchors = [...text.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)];
  const matching = anchors.filter(([, href]) => linkPattern.test(href));
  const pdfs = anchors.filter(([, href]) => /\.pdf(\?|$)/i.test(href));
  const shell = /__NEXT_DATA__|window\.__NUXT__|id="root"|ng-version/.test(text);
  const text_only = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const note = [
    `${Math.round(text.length / 1024)}KB`,
    `正文 ${text_only.length} 字`,
    `${anchors.length} 个链接（命中 ${matching.length}，PDF ${pdfs.length}）`,
    shell ? "⚠ 像是前端框架壳子（__NEXT_DATA__ / #root），链接可能是 JS 后填的" : "服务端渲染，可抓",
  ].join(" · ");
  return { note, links: matching.slice(0, 8).map(([, href, label]) => `${label.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 70)} → ${href.slice(0, 110)}`) };
}

async function probeHtml(label: string, why: string, url: string, linkPattern: RegExp, timeoutMs: number, headers?: Record<string, string>): Promise<void> {
  console.log(label);
  console.log(`   为什么试它：${why}`);
  console.log(`   ${url}`);
  const { status, ms, text, failure } = await fetchText(url, timeoutMs, headers);
  if (failure !== undefined) {
    record({ label, ok: false, status, ms, note: failure.slice(0, 260) });
    return;
  }
  if (typeof status === "number" && (status < 200 || status >= 300)) {
    record({ label, ok: false, status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) });
    return;
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Asked for HTML, got JSON — that is the best possible outcome here and
    // would be hidden by an HTML-shaped report, so it is called out.
    let keys = "";
    try {
      const body = JSON.parse(trimmed) as unknown;
      keys = Array.isArray(body) ? `数组，${body.length} 项` : Object.keys(body as Record<string, unknown>).slice(0, 20).join(", ");
    } catch {
      keys = "（解析失败）";
    }
    record({ label, ok: true, status, ms, note: `★ 返回的是 JSON 不是 HTML —— 外层键：${keys}` });
    console.log(trimmed.slice(0, 1200).split("\n").map((line) => `     ${line}`).join("\n"));
    console.log();
    return;
  }
  const { note, links } = describeHtml(text, linkPattern);
  record({ label, ok: true, status, ms, note });
  for (const link of links) console.log(`     ${link}`);
  if (links.length > 0) console.log();
}

/**
 * The three-step CKAN read: is it CKAN → which datasets → what are the columns.
 *
 * Each step is reported separately on purpose. "ANEEL has no transmission
 * data" and "ANEEL is not a CKAN portal" and "the dataset exists but its rows
 * are not in the datastore" need three different next moves, and a single
 * combined FAIL would hide which one happened.
 */
async function probeCkan(
  label: string,
  why: string,
  base: string,
  queries: string[],
  timeoutMs: number,
  rows: number,
  collected: { portal: string; pkg: CkanPackage }[],
): Promise<void> {
  console.log(label);
  console.log(`   为什么试它：${why}`);
  console.log(`   ${base}`);

  const started = Date.now();
  try {
    const status = await ckanStatus(base, { timeoutMs });
    record({ label: `${label} · status_show`, ok: true, status: 200, ms: Date.now() - started, note: `确认是 CKAN ${status.ckanVersion ?? "?"} —— ${status.siteTitle ?? ""}（扩展：${status.extensions.join(", ") || "无"}）` });
  } catch (err) {
    record({ label: `${label} · status_show`, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - started, note: `${(err as Error).message.slice(0, 240)}` });
    console.log("   → 不是 CKAN（或这个域名不对）。后面几步跳过，省得拿同一个错误刷屏。\n");
    return;
  }

  const seen = new Set<string>();
  const hits: CkanPackage[] = [];
  for (const q of queries) {
    await sleep(800);
    const t0 = Date.now();
    try {
      const search = await ckanPackageSearch(base, { q, rows }, { timeoutMs });
      const fresh = search.results.filter((pkg) => pkg.name !== undefined && !seen.has(pkg.name));
      for (const pkg of fresh) {
        seen.add(pkg.name as string);
        hits.push(pkg);
        collected.push({ portal: base, pkg });
      }
      record({ label: `${label} · q="${q}"`, ok: true, status: 200, ms: Date.now() - t0, note: `${search.count} 个数据集命中，本页 ${search.results.length} 个，新增 ${fresh.length}` });
      for (const pkg of search.results.slice(0, rows)) {
        const resources = pkg.resources ?? [];
        const live = resources.filter((r) => r.datastore_active === true).length;
        console.log(`     · ${pkg.title ?? pkg.name}`);
        console.log(`       name=${pkg.name}  更新=${(pkg.metadata_modified ?? "?").slice(0, 10)}  资源 ${resources.length} 个（可直接查表的 ${live} 个）  ${resources.map((r) => r.format ?? "?").join("/")}`);
      }
      console.log();
    } catch (err) {
      record({ label: `${label} · q="${q}"`, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - t0, note: (err as Error).message.slice(0, 220) });
    }
  }

  // Step three, and the only one a mapper is written from: real column names.
  // Preference order is deliberate — a datastore-backed resource answers with
  // typed columns, everything else would mean downloading and guessing.
  const target = hits.find((pkg) => (pkg.resources ?? []).some((r) => r.datastore_active === true && r.id));
  if (!target) {
    console.log(`   ${hits.length === 0 ? "没有命中任何数据集" : "命中的数据集里没有一个资源开了 datastore"} —— 拿不到字段名。`);
    console.log("   → 这不是失败，是个结论：字段得从资源文件本身读（CSV/XLSX），映射器要按文件写。\n");
    return;
  }
  const resource = (target.resources ?? []).find((r) => r.datastore_active === true && r.id)!;
  console.log(`   字段实测：${target.title ?? target.name} → 资源「${resource.name ?? resource.id}」`);
  const t1 = Date.now();
  try {
    const data = await ckanDatastoreSearch(base, { resourceId: resource.id as string, limit: 3 }, { timeoutMs });
    record({ label: `${label} · datastore_search`, ok: true, status: 200, ms: Date.now() - t1, note: `${data.total} 行，${data.fields.length} 列` });
    console.log(`     列名：${data.fields.map((f) => `${f.id}:${f.type ?? "?"}`).join(", ")}`);
    console.log("     第一行全文：");
    console.log(JSON.stringify(data.records[0] ?? null, null, 2).split("\n").map((line) => `       ${line}`).join("\n"));
    console.log();
  } catch (err) {
    record({ label: `${label} · datastore_search`, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - t1, note: (err as Error).message.slice(0, 220) });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 90) || 90) * 1000;
  const rows = Math.max(1, Number(arg("--rows") ?? 6) || 6);
  const collected: { portal: string; pkg: CkanPackage }[] = [];

  console.log(`巴西特许经营 / 输电拍卖 —— 数据入口实测，每条最多等 ${Math.round(timeoutMs / 1000)}s\n`);
  console.log("这一轮要回答的就两个问题：");
  console.log("  1. PPI 的项目清单有没有机器可读的形式？没有的话，抓 HTML 行不行？");
  console.log("  2. ANEEL（和 CCEE）的开放数据是不是 CKAN？输电拍卖的表，列名到底叫什么？\n");
  console.log("─".repeat(72));
  console.log("\nP. PPI —— 联邦特许经营总盘子（公路/港口/机场/铁路）\n");

  await probeHtml(
    "P1. ppi.gov.br 项目清单（HTML 原样）",
    "先分清是「服务端渲染的 CMS 列表」还是「前端框架壳子」—— 这一条决定了抓取到底可不可行，状态码看不出来",
    "https://www.ppi.gov.br/projetos",
    /projeto|\/projetos\//i,
    timeoutMs,
  );
  await sleep(1500);

  await probeHtml(
    "P2. 同一个网址，但要求返回 JSON",
    "gov.br 的门户很多是 Plone，而 Plone 只要装了 plone.restapi，同一个 URL 加个 Accept: application/json 就直接给结构化数据 —— 值一次请求去试",
    "https://www.ppi.gov.br/projetos",
    /projeto/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  await probeHtml(
    "P3. Plone 的搜索接口 @@search",
    "如果 P2 通了，这个才是真正能翻页拉全量的入口；如果 P2 没通，这条会一起告诉我们 restapi 是不是根本没装",
    "https://www.ppi.gov.br/@@search?portal_type=Document&b_size=5&metadata_fields=modified",
    /projeto/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  await probeHtml(
    "P4. 站点地图",
    "如果结论是「只能抓 HTML」，那清单页的翻页就是下一个坑；sitemap 能一次把所有项目页的网址列出来，绕开翻页",
    "https://www.ppi.gov.br/sitemap.xml",
    /projeto/i,
    timeoutMs,
  );
  await sleep(1500);

  // dados.gov.br — the national catalogue. Worth one call because if the PPI
  // portfolio is published there as a dataset, the whole scraping question
  // disappears.
  await probeCkan(
    "P5. dados.gov.br（国家开放数据门户）",
    "PPI 的项目库有没有以数据集形式发布在国家门户上 —— 如果有，上面的抓取问题整个不存在了",
    "https://dados.gov.br",
    // All four sectors in one place: the national catalogue is where every
    // federal body is required to register its datasets, which makes it a
    // better bet than guessing four agency hostnames.
    ["PPI parcerias investimentos", "concessão rodoviária ANTT", "arrendamento portuário ANTAQ", "concessão aeroportuária ANAC"],
    timeoutMs,
    rows,
    collected,
  );

  console.log("─".repeat(72));
  console.log("\nP6–P8. 行业监管机构和公报 —— 招标文件其实是它们发的，不是 PPI 发的\n");
  console.log("   PPI 公布的是「盘子」，真正的 edital：公路铁路看 ANTT，港口看 ANTAQ，机场看 ANAC。");
  console.log("   谁家有开放数据门户，谁就是比抓 PPI 页面更靠谱的入口。\n");

  await probeCkan(
    "P6. ANTT（公路 + 铁路）",
    "公路和铁路特许经营的主管机构 —— PPI 盘子里最大的一块，而且它确实有一个独立的开放数据域名",
    "https://dados.antt.gov.br",
    ["leilão concessão", "outorga rodoviária"],
    timeoutMs,
    rows,
    collected,
  );

  // ANTAQ gets an HTML probe rather than a CKAN one: its open-data host does
  // not resolve (see the DNS note at the top), so the portal page is the only
  // address there is evidence for.
  await probeHtml(
    "P7. ANTAQ 门户（港口租赁 / 特许）",
    "港口的主管机构。它没有独立的开放数据域名（我猜的那两个 DNS 都不存在），所以这里问的是另一个问题：门户页上的 leilão / edital 链接抓不抓得到",
    "https://portal.antaq.gov.br",
    /leil|edital|arrendamento|concess/i,
    timeoutMs,
  );
  await sleep(1500);

  // ANAC is deliberately absent here. The open-data hostname I would have
  // written does not exist, and a guessed one produces a FAIL that says
  // nothing — P5's catalogue query is where ANAC is looked for instead.

  // The DOU is the one door that does not depend on any agency's website
  // being good: an aviso de licitação for a federal concession must be
  // published there. It is also the exact shape of a connector this repo
  // already has — the Mexican DOF — which is why it is worth one step even
  // though it was not asked for.
  await probeHtml(
    "P8. DOU（联邦公报）检索页",
    "所有联邦特许的招标公告依法都要登公报 —— 这条路不依赖哪个机构的网站做得好不好，而且墨西哥的 DOF 连接器已经是同一个形状了",
    "https://www.in.gov.br/consulta/-/buscar/dou?q=leil%C3%A3o+de+transmiss%C3%A3o&s=todos&exactDate=all&sortType=0",
    /leil|edital|aviso/i,
    timeoutMs,
  );
  await sleep(1500);

  console.log("─".repeat(72));
  console.log("\nE. ANEEL / CCEE —— 输电拍卖\n");
  console.log("   分工先说清楚，免得两边都白花力气：**输电拍卖是 ANEEL 办的**（edital 是 ANEEL 的，");
  console.log("   拍卖当天在 B3 交易所开），**CCEE 办的是发电侧的能源拍卖**并负责市场结算。");
  console.log("   用户问的那个（国网、三峡在巴西的主战场）是前者。\n");

  await probeCkan(
    "E1. ANEEL 开放数据",
    "输电拍卖的标段、RAP 上限、中标方 —— 如果有表，字段名就在这里；这一步先确认它是不是 CKAN",
    "https://dadosabertos.aneel.gov.br",
    ["leilão transmissão", "transmissão lote", "leilão", "concessão transmissão"],
    timeoutMs,
    rows,
    collected,
  );

  await probeHtml(
    "E2. ANEEL 拍卖专页（找 edital 原文）",
    "就算 E1 有表，招标文件本身还是 PDF —— 这一步看链接拿不拿得到，以及是不是需要登录",
    "https://www.aneel.gov.br/leiloes-de-transmissao",
    /\.pdf|edital|leil/i,
    timeoutMs,
  );
  await sleep(1500);

  await probeCkan(
    "E3. CCEE 开放数据",
    "发电侧拍卖（新能源、储能）和市场结算数据。不是用户问的那一块，但同一批中资企业也在投，顺手确认一下门在哪",
    "https://dadosabertos.ccee.org.br",
    ["leilão", "energia nova"],
    timeoutMs,
    rows,
    collected,
  );

  await probeHtml(
    "E4. B3 拍卖页",
    "拍卖当天的会场在 B3，中标结果最先出现在这里。多半是个 JS 壳子 —— 那也是结论，说明结果得回 ANEEL 取",
    "https://www.b3.com.br/pt_br/b3/qualificacao-e-governanca/leiloes/",
    /leil|edital/i,
    timeoutMs,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("─".repeat(72));
  console.log("小结\n");
  for (const outcome of outcomes) {
    console.log(`  ${(outcome.ok ? "OK  " : "FAIL").padEnd(5)} ${String(outcome.status).padEnd(14)} ${String(outcome.ms).padStart(7)}ms  ${outcome.label}`);
  }
  console.log();

  if (collected.length > 0) {
    const csv = toCsv(
      ["portal", "dataset_name", "title", "organization", "metadata_modified", "resources", "datastore_resources", "formats", "notes"],
      collected.map(({ portal, pkg }): CsvValue[] => {
        const resources = pkg.resources ?? [];
        return [
          portal,
          pkg.name ?? "",
          pkg.title ?? "",
          pkg.organization?.title ?? pkg.organization?.name ?? "",
          pkg.metadata_modified ?? "",
          resources.length,
          resources.filter((r) => r.datastore_active === true).length,
          [...new Set(resources.map((r) => (r.format ?? "?").toUpperCase()))].join("/"),
          (pkg.notes ?? "").replace(/\s+/g, " ").slice(0, 300),
        ];
      }),
    );
    writeReviewCsv({
      dir: OUT_DIR,
      baseName: `brazil-concessions-datasets-${new Date().toISOString().slice(0, 10)}`,
      csv,
      label: "probe:brazil-concessions",
      failureNote: "上面终端里的数据集清单没有丢，CSV 只是没写成。",
    });
    console.log();
  }

  const ckanOk = outcomes.some((o) => o.ok && /status_show/.test(o.label));
  console.log("要发我的东西，按重要性排：\n");
  console.log("  1. 【列名】那几行 —— 也就是 datastore_search 打出来的 `列名：…` 和 `第一行全文`。");
  console.log("     映射器是照着它写的，不是照着我记忆里的字段名写的。");
  console.log("  2. P1 那条的判定：「服务端渲染，可抓」还是「前端框架壳子」。PPI 能不能做，就看这一句。");
  console.log("  3. 所有 FAIL 后面那串错误链（`A ← B ← C`）—— DNS、TLS、连接重置、对方拒绝，");
  console.log("     这四种要改的地方完全不一样，只有链子能说清是哪种。");
  if (!ckanOk) {
    console.log("\n  提醒：这一轮没有任何一个门户确认是 CKAN。先别下「巴西没有开放数据」的结论 ——");
    console.log("  更可能是域名写错了（这几个域名是我按惯例写的，没能在这里验证过）。错误链会区分这两种。");
  }
  console.log("\n还有一件跟接口无关、但会影响结果的事 —— 见 lib/ingestion/README.md 的");
  console.log("「Three traps that are new, and the first one changes displayed numbers」：");
  console.log("输电标段的「金额」到底指 RAP（每年允许收的钱）还是 CAPEX（总投资），这两个数差着量级。");
  console.log("定错了的话，接口写得再对，前台显示的数字也是错的。");
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
