import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";
import { ckanAction, ckanPackageSearch, type CkanPackage } from "@/lib/ingestion/connectors/ckan";

/**
 * What is actually BEHIND the doors that opened.
 *
 * `brazil-doors.ts` answered "can this machine reach the host". Both servers
 * said yes to the same nine, which retires that question. It does not answer
 * the one that decides whether a connector gets written:
 *
 *   The ANEEL bidder page answers in 278ms and carries 805 links. Do any of
 *   them lead to an auction that is still open for bids, and are those links
 *   on a host we can reach?
 *
 * That distinction has already cost this repo once. `scripts/dump-aneel-leiloes.ts`
 * exists because the ANEEL auction page — reachable, fast, server-rendered —
 * links its three result spreadsheets on `git.aneel.gov.br`, which is not
 * reachable. An open page whose every useful link points at a closed host is
 * a closed source wearing a 200.
 *
 * So the number this prints is the number that matters: of the links worth
 * following, how many land somewhere we can actually fetch.
 *
 * Read-only. No Supabase, no writes, no model calls.
 */

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 20_000;

/**
 * Hosts both servers refused on 2026-09-19, by id in the door report.
 *
 * Kept as data rather than prose because the point of this probe is to count
 * links against it. When a door changes state, this list changes with it and
 * the counts move on their own.
 */
const CLOSED_HOSTS: Record<string, string> = {
  "leilao.aneel.gov.br": "TCP 超时（E1c/B2）",
  "portalrelatorios.aneel.gov.br": "TCP 超时（E2f）",
  "git.aneel.gov.br": "Cloudflare 验证（E2c/E2d/B3）",
  "www2.aneel.gov.br": "Cloudflare 验证（E2e）",
  "portal.antaq.gov.br": "Cloudflare 验证（P7）",
  "leilao.antaq.gov.br": "Cloudflare 验证（B1）",
  "www.ppi.gov.br": "ECONNRESET（P1/P3）",
  "ppi.gov.br": "Acesso Negado（E3b）",
  "dadosabertos.ccee.org.br": "Acesso bloqueado（E3）",
  "dados.gov.br": "401 要巴西身份（P5）",
};

/** Hosts both servers opened. Anything else is unknown, not assumed. */
const OPEN_HOSTS = new Set([
  "dadosabertos.aneel.gov.br",
  "dadosabertos-aneel.opendata.arcgis.com",
  "www.gov.br",
  "dados.antt.gov.br",
  "www.in.gov.br",
  "sistemas.anac.gov.br",
]);

export type LinkReach = "open" | "closed" | "unknown";

export type PageLink = { href: string; text: string; host: string; ext: string; reach: LinkReach; why: string };

/**
 * Worth following: something that could be an auction, a notice or a document.
 *
 * Deliberately generous. A false positive costs one line of report; a false
 * negative is the edital we conclude does not exist.
 */
const INTERESTING =
  /edital|leil[aã]o|leiloes|leil[oõ]es|aviso|consulta\s*p[uú]blica|audi[eê]ncia|chamada|concess[aã]o|termo\s*de\s*refer|minuta|anexo|\.pdf|\.xlsx|\.xls|\.zip|\.docx?/i;

/** An auction that has not been decided yet — the only kind this platform can sell. */
const STILL_OPEN_HINT = /aberto|em\s*andamento|pr[oó]xim|futuro|a\s*realizar|consulta\s*p[uú]blica|audi[eê]ncia\s*p[uú]blica|previst/i;

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/**
 * gov.br runs Plone, which serves a file at `.../edital.pdf/@@download/file`.
 * Reading only the last segment calls every one of those a page, and a report
 * saying "0 PDFs" on the editais page reads as "there are no editais here".
 * Scanning back a few segments finds the extension in both shapes; the cap
 * keeps it from wandering into a path that merely contains a dot.
 */
function extensionOf(pathname: string): string {
  const segments = pathname.split("/").filter((s) => s !== "");
  for (const segment of segments.slice(-3).reverse()) {
    const match = /\.([a-z0-9]{2,5})$/i.exec(segment);
    if (match) return match[1].toLowerCase();
  }
  return "（页面）";
}

function reachOf(host: string): { reach: LinkReach; why: string } {
  if (CLOSED_HOSTS[host] !== undefined) return { reach: "closed", why: CLOSED_HOSTS[host] };
  if (OPEN_HOSTS.has(host)) return { reach: "open", why: "两台服务器都通" };
  return { reach: "unknown", why: "没敲过" };
}

/**
 * Every `<a href>` on the page, absolute, de-duplicated by URL.
 *
 * A regex rather than a DOM: this repo has no HTML parser in its runtime
 * dependencies, and the question here is "which hosts do the links point at",
 * which survives sloppy parsing. Nothing is mapped from the result — it is
 * read by a person and then a connector gets written properly.
 */
export function collectLinks(html: string, baseUrl: string): PageLink[] {
  const seen = new Map<string, PageLink>();
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = decodeEntities(match[1]).trim();
    if (raw === "" || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const text = decodeEntities(match[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    const key = url.toString();
    if (seen.has(key)) continue;
    const { reach, why } = reachOf(url.host);
    seen.set(key, { href: key, text, host: url.host, ext: extensionOf(url.pathname), reach, why });
  }
  return [...seen.values()];
}

export function isInteresting(link: PageLink): boolean {
  return INTERESTING.test(link.text) || INTERESTING.test(link.href);
}

export type PageReading = {
  id: string;
  what: string;
  url: string;
  ok: boolean;
  note: string;
  links: PageLink[];
};

async function readPage(id: string, what: string, url: string): Promise<PageReading> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    const html = await response.text();
    if (!response.ok) return { id, what, url, ok: false, note: `拒绝 ${response.status} · ${pageTitle(html) || "（无标题）"}`, links: [] };
    const blocked = blockPageReason(html);
    if (blocked !== null) return { id, what, url, ok: false, note: `200 但是拦截页「${blocked}」`, links: [] };
    const links = collectLinks(html, url);
    return { id, what, url, ok: true, note: `${Math.round(html.length / 1024)}KB · 正文 ${visibleText(html).length} 字 · ${links.length} 个链接`, links };
  } catch (err) {
    return { id, what, url, ok: false, note: `连不上 ← ${describeFetchFailure(err).slice(0, 160)}`, links: [] };
  } finally {
    clearTimeout(timer);
  }
}

const PAGES: { id: string; what: string; url: string }[] = [
  { id: "E2b", what: "ANEEL 给投标人看的拍卖页", url: "https://www.gov.br/aneel/pt-br/empreendedores/leiloes" },
  { id: "E2", what: "ANEEL 拍卖专页（资料中心）", url: "https://www.gov.br/aneel/pt-br/centrais-de-conteudos/relatorios-e-indicadores/leiloes" },
  { id: "B5", what: "ANTAQ 拍卖索引", url: "https://www.gov.br/antaq/pt-br/assuntos/leiloes" },
  { id: "B6", what: "ANAC 机场特许开放数据目录", url: "https://sistemas.anac.gov.br/dadosabertos/AeroportosConcedidos/SETIMA_RODADA/" },
  // Round one's finding, followed one level down. Every auction on the ANTAQ
  // index (80 of its 89 useful links) lives on leilao.antaq.gov.br, and all
  // three ANEEL auction categories live on leilao.aneel.gov.br — both shut.
  // What survived the scoring, on both agencies, was the same pair of paths:
  // the public-consultation section and the notices page, BOTH on www.gov.br.
  // B7 already proved that route carries a real 659KB draft edital. So these
  // four are not more of the same list — they are the only candidate route
  // left that is reachable end to end, and a consultation is EARLIER than an
  // auction, which for a foreign bidder reading Portuguese is the better end
  // of the funnel anyway.
  { id: "E4", what: "ANEEL 公开听证（草案 edital 在这一层）", url: "https://www.gov.br/aneel/pt-br/acesso-a-informacao/participacao-social/audiencias-publicas" },
  { id: "E5", what: "ANEEL 给投标人的公告页", url: "https://www.gov.br/aneel/pt-br/empreendedores/avisos" },
  { id: "B8", what: "ANTAQ 特许经营项目（不是拍卖索引）", url: "https://www.gov.br/antaq/pt-br/assuntos/projetos-de-concessao" },
  { id: "B9", what: "ANTAQ 听证与公开征询 —— B7 那份 659KB 标书草案就在这一层", url: "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas" },
];

const ANEEL_CKAN = "https://dadosabertos.aneel.gov.br";
const ANTT_CKAN = "https://dados.antt.gov.br";
const ANEEL_TRANSMISSAO_RESOURCE = "453cb742-8089-4c16-aaf2-42088b5553dc";

export type CkanReading = { id: string; what: string; ok: boolean; note: string; lines: string[] };

/**
 * How current the ANEEL results table is.
 *
 * The whole value of this reading is one number: the newest `AnoLeilao` in
 * the datastore. If it stops at a past year the table is a historical archive
 * and nothing in it is biddable — which decides what the ANEEL work is worth
 * building, and is not visible from the row count.
 */
async function readAneelDatastore(): Promise<CkanReading> {
  const id = "E1";
  const what = "ANEEL 输电拍卖结果表 —— 最新的是哪一年？";
  try {
    const result = await ckanAction<{ total?: number; records?: Record<string, unknown>[] }>(
      ANEEL_CKAN,
      "datastore_search",
      { resource_id: ANEEL_TRANSMISSAO_RESOURCE, limit: 5, sort: "AnoLeilao desc, DatLeilao desc" },
      { timeoutMs: TIMEOUT_MS },
    );
    const records = result.records ?? [];
    const lines = records.map((row) => {
      const parts = [
        `${row.AnoLeilao ?? "?"} 年`,
        `第 ${row.NumLeilao ?? "?"} 场 / 标段 ${row.NumLoteLeilao ?? "?"}`,
        String(row.NomEmpreendimento ?? "").slice(0, 46) || "（无名称）",
        row.SigUFPrincipal ? String(row.SigUFPrincipal) : "",
        row.MdaExtensaoLinhaTransmissaoKm ? `${row.MdaExtensaoLinhaTransmissaoKm} km` : "",
        row.VlrInvestimentoPrevisto ? `预计投资 R$ ${row.VlrInvestimentoPrevisto}` : "无投资额",
        row.NomVencedorLeilao ? `中标：${String(row.NomVencedorLeilao).slice(0, 26)}` : "未见中标方",
      ].filter((p) => p !== "");
      return parts.join(" · ");
    });
    return { id, what, ok: true, note: `共 ${result.total ?? 0} 行，按年份倒序取 5 行`, lines };
  } catch (err) {
    return { id, what, ok: false, note: describeFetchFailure(err).slice(0, 200), lines: [] };
  }
}

function describePackages(packages: CkanPackage[]): string[] {
  return packages.map((pkg) => {
    const resources = Array.isArray(pkg.resources) ? pkg.resources : [];
    const formats = [...new Set(resources.map((r) => (r.format ?? "?").toUpperCase()))].join("/");
    const live = resources.filter((r) => r.datastore_active === true).length;
    return `${(pkg.title ?? pkg.name ?? "?").slice(0, 52)} — ${resources.length} 个资源 [${formats || "无"}]${live > 0 ? ` · ${live} 个可直接查表` : " · 没有可直接查的表"}`;
  });
}

async function searchCkan(id: string, what: string, base: string, q: string): Promise<CkanReading> {
  try {
    const found = await ckanPackageSearch(base, { q, rows: 8 }, { timeoutMs: TIMEOUT_MS });
    return { id, what, ok: true, note: `「${q}」命中 ${found.count} 个数据集，列前 ${found.results.length} 个`, lines: describePackages(found.results) };
  } catch (err) {
    return { id, what, ok: false, note: describeFetchFailure(err).slice(0, 200), lines: [] };
  }
}

/**
 * Which ANTT request shapes the F5 appliance in front of it will pass.
 *
 * Its verdict decides whether the ANTT portal is a source or a dead end, and
 * one rejected call is not enough to say. `status_show` passed minutes
 * earlier from this same runner, so the difference is in the request, not the
 * route.
 */
async function probeAnttRequestShapes(): Promise<CkanReading[]> {
  const shapes: { id: string; what: string; action: string; params: Record<string, string | number | undefined> }[] = [
    { id: "P6b", what: "ANTT · package_search，带重音查询词 concessão", action: "package_search", params: { q: "concessão", rows: 5 } },
    { id: "P6c", what: "ANTT · package_search，纯 ASCII 查询词 rodovia", action: "package_search", params: { q: "rodovia", rows: 5 } },
    { id: "P6d", what: "ANTT · package_search，不带任何查询词", action: "package_search", params: { rows: 5 } },
    { id: "P6e", what: "ANTT · package_list，换一个动作", action: "package_list", params: {} },
  ];
  const readings: CkanReading[] = [];
  for (const shape of shapes) {
    try {
      const result = await ckanAction<unknown>(ANTT_CKAN, shape.action, shape.params, { timeoutMs: TIMEOUT_MS });
      if (Array.isArray(result)) {
        readings.push({ id: shape.id, what: shape.what, ok: true, note: `通了 —— ${result.length} 项`, lines: result.slice(0, 8).map((v) => String(v)) });
        continue;
      }
      const search = result as { count?: number; results?: CkanPackage[] };
      readings.push({
        id: shape.id,
        what: shape.what,
        ok: true,
        note: `通了 —— 命中 ${search.count ?? 0} 个数据集`,
        lines: describePackages(Array.isArray(search.results) ? search.results : []),
      });
    } catch (err) {
      readings.push({ id: shape.id, what: shape.what, ok: false, note: describeFetchFailure(err).slice(0, 150), lines: [] });
    }
  }
  return readings;
}

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderPage(page: PageReading): string[] {
  const head = [`${page.id}  ${page.what}`, `    ${page.url}`];
  if (!page.ok) return [...head, `    ${page.note}`, ""];

  const interesting = page.links.filter(isInteresting);
  const closed = interesting.filter((l) => l.reach === "closed");
  const open = interesting.filter((l) => l.reach === "open");
  const unknown = interesting.filter((l) => l.reach === "unknown");

  const out = [
    ...head,
    `    ${page.note}`,
    `    值得跟的链接 ${interesting.length} 条 —— 能取 ${open.length} · 取不到 ${closed.length} · 没敲过 ${unknown.length}`,
    "",
    "    链接落在哪些域名：",
    ...tally(page.links.map((l) => l.host))
      .slice(0, 10)
      .map(([host, n]) => {
        const { reach, why } = reachOf(host);
        const mark = reach === "open" ? "通" : reach === "closed" ? "不通" : "未知";
        return `      ${String(n).padStart(4)}  ${host.padEnd(34)} ${mark}  ${why}`;
      }),
    "",
    "    值得跟的链接是什么文件：",
    ...tally(interesting.map((l) => l.ext))
      .slice(0, 8)
      .map(([ext, n]) => `      ${String(n).padStart(4)}  ${ext}`),
  ];

  const openable = [...open, ...unknown];
  if (openable.length > 0) {
    out.push("", "    能取到的，前 14 条：");
    for (const link of openable.slice(0, 14)) {
      const hint = STILL_OPEN_HINT.test(link.text) ? " ← 可能是在招" : "";
      out.push(`      · ${(link.text || "（无文字）").slice(0, 70)}${hint}`);
      out.push(`        ${link.href.slice(0, 116)}`);
    }
  }
  if (closed.length > 0) {
    out.push("", `    取不到的，前 6 条（这些就是 200 页面背后的空头支票）：`);
    for (const link of closed.slice(0, 6)) {
      out.push(`      · ${(link.text || "（无文字）").slice(0, 60)} → ${link.host}  ${link.why}`);
    }
  }
  out.push("");
  return out;
}

function renderCkan(reading: CkanReading): string[] {
  return [
    `${reading.id}  ${reading.what}`,
    `    ${reading.ok ? reading.note : `读不到 ← ${reading.note}`}`,
    ...reading.lines.map((line) => `      · ${line}`),
    "",
  ];
}

export async function lookBehindDoors(where: string): Promise<string> {
  const pages: PageReading[] = [];
  for (const page of PAGES) pages.push(await readPage(page.id, page.what, page.url));

  const ckan: CkanReading[] = [
    await readAneelDatastore(),
    await searchCkan("E1d", "ANEEL 开放数据里还有什么跟拍卖有关的", ANEEL_CKAN, "leilão"),
    await searchCkan("E1e", "ANEEL 开放数据里的扩建计划（在招之前的那一步）", ANEEL_CKAN, "expansão transmissão"),
    // Round one turned up a contradiction worth resolving rather than
    // recording: `status_show` on this host answers "CKAN 2.8.3" while
    // `package_search` comes back as an F5 "Request Rejected" page — a 200
    // carrying a block, which lib/ingestion/block-page.ts exists for. The host
    // is not shut; something about THAT request shape is refused. These three
    // vary one thing at a time — an accented query, a plain ASCII one, no
    // query at all, and a different action entirely — because "ANTT is
    // blocked" and "ANTT rejects a `q` parameter" lead to different work.
    ...(await probeAnttRequestShapes()),
  ];

  const allInteresting = pages.flatMap((p) => p.links.filter(isInteresting));
  const reachable = allInteresting.filter((l) => l.reach !== "closed").length;

  return [
    `开着的门后面是什么 —— 从【${where}】这一侧读`,
    "",
    "上一轮问的是「够不够得着这台主机」，两台服务器答案一样，那题结了。",
    "这一轮问的是「够得着的那几页里，有没有能投的标，链接落不落在够得着的主机上」。",
    "ANEEL 那一页就是前车之鉴：页面 278ms 打开，三个结果表全挂在打不开的 git.aneel 上。",
    "",
    "────────────────────────────────────────────────────────────────────────",
    "",
    ...pages.flatMap(renderPage),
    "────────────────────────────────────────────────────────────────────────",
    "",
    ...ckan.flatMap(renderCkan),
    "────────────────────────────────────────────────────────────────────────",
    "",
    `四页一共 ${allInteresting.length} 条值得跟的链接，其中 ${reachable} 条落在够得着的主机上。`,
    "这个数字才是「能不能建连接器」的答案；页面打得开不是。",
  ].join("\n");
}
