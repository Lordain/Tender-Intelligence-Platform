import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";

/**
 * The same doors as `npm run probe:brazil-concessions`, knocked on from a
 * machine we control rather than from the user's laptop.
 *
 * WHY THIS IS A LIBRARY AND NOT JUST A ROUTE (2026-09-19). The route ran, and
 * it worked: two doors that are shut on the laptop opened from Vercel —
 * `dadosabertos.aneel.gov.br`, which never completed a TCP handshake from
 * São Paulo or from here, answered in 1.5s, and `dados.antt.gov.br`, which
 * serves the laptop an F5 rejection page, answered as CKAN 2.8.3. So the
 * egress really is the variable, and "run it on a server" really is an
 * answer.
 *
 * But not necessarily on THAT server. Ingestion does not run on Vercel — it
 * moved to GitHub Actions in .github/workflows/daily-ingest.yml, for reasons
 * (no 42-second request ceiling, logs that outlive the incident, a re-run
 * button) that have not changed. GitHub's runners are a third network, with
 * no relationship to Vercel's. A connector written against `dadosabertos.aneel`
 * because Vercel reached it would fail on the machine that actually runs it,
 * every night, silently.
 *
 * Hence: one door list, two callers. The admin route asks from Vercel; the
 * workflow asks from a runner. Whatever the runner answers is the one that
 * decides what gets built, because that is where the connector will live.
 */

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  // Same posture as every connector here: identify honestly to a public
  // service rather than impersonate a browser. Run two settled that a
  // browser User-Agent does not open any of these anyway — Cloudflare's
  // challenge wants a browser that runs JavaScript, not a string claiming
  // to be one — so there is nothing to gain by lying here either.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

export type Door = { id: string; what: string; url: string };

export type DoorResult = Door & { verdict: string; detail: string; ms: number };

/** One check per door. `what` is written for the person reading the report. */
export const BRAZIL_DOORS: Door[] = [
  // The first one is the whole point of the round. Web search (which reaches
  // ANEEL even where HTTP from here does not) named the dataset and the
  // resource id, so this is not discovery — it is the column contract a
  // mapper gets written from, one request away.
  {
    id: "E1",
    what: "ANEEL 输电拍卖结果表 —— 直接按已知 resource id 取字段（1999 年至今的中标结果）",
    url: "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search?resource_id=453cb742-8089-4c16-aaf2-42088b5553dc&limit=3",
  },
  // Not a .gov.br host: Esri's ArcGIS Hub on AWS. If the refusals are
  // geographic, this mirror has the best odds of any door on the list.
  { id: "E1b", what: "ANEEL 开放数据的 ArcGIS 镜像（商业 CDN，不是 .gov.br）", url: "https://dadosabertos-aneel.opendata.arcgis.com/api/feed/dcat-us/1.1.json" },
  { id: "E1c", what: "ANEEL 拍卖系统 —— 在招的场次在这儿，不在开放数据里", url: "https://leilao.aneel.gov.br/listaLeiloesFinalizados" },
  { id: "E2", what: "ANEEL 拍卖专页（gov.br 现址）— edital 原文", url: "https://www.gov.br/aneel/pt-br/centrais-de-conteudos/relatorios-e-indicadores/leiloes" },
  { id: "E2b", what: "ANEEL 给投标人看的拍卖页 —— 在招场次更可能在这里", url: "https://www.gov.br/aneel/pt-br/empreendedores/leiloes" },
  // Run three's find, and the reason this list changed shape: E2's page (which
  // answers from BOTH machines) links three "Planilha em Excel" files on
  // git.aneel.gov.br — a GitLab instance serving raw files. Different host
  // from the one that times out, stable paths, versioned, and enumerable
  // through GitLab's own credential-free API. The project path is read out of
  // the raw URL rather than recalled.
  {
    id: "E2c",
    what: "ANEEL 的 GitLab —— 拍卖结果 Excel 的目录（这条最可能就是连接器的取数路径）",
    url: "https://git.aneel.gov.br/api/v4/projects/publico%2Fcentralconteudo/repository/tree?path=relatorioseindicadores%2Fleiloes&ref=main&per_page=100",
  },
  { id: "E2d", what: "同上，直接取一个原始文件（看 raw 路径要不要登录）", url: "https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_transmissao.xlsx" },
  // Added after the hard block on git.aneel: two more ANEEL hosts, because a
  // Cloudflare block is configured per host, not per agency. The deployment
  // saw git.aneel's CHALLENGE page rather than the block the user's browser
  // got, so of the two machines this is the one with a chance.
  { id: "E2e", what: "www2 上的输电 edital 应用（在招场次）", url: "https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm" },
  { id: "E2f", what: "ANEEL 报表门户的输电拍卖结果（同一批数据的第三份）", url: "https://portalrelatorios.aneel.gov.br/resultadosLeiloes/leiloesTransmissao" },
  { id: "E3", what: "CCEE 开放数据（发电侧拍卖）", url: "https://dadosabertos.ccee.org.br/api/3/action/status_show" },
  // Static PDF under /wp-content/uploads/, in English, no session and no
  // challenge — the least defended thing on this list if it answers at all.
  { id: "E3b", what: "PPI 上的英文版 ANEEL 输电拍卖 edital（静态 PDF）", url: "https://ppi.gov.br/wp-content/uploads/2025/02/Edital_LT_4-2025_ingles.pdf" },
  { id: "P1", what: "PPI 项目清单", url: "https://www.ppi.gov.br/projetos" },
  { id: "P3", what: "PPI 的 WordPress REST 接口（它是 WordPress，不是 Plone）", url: "https://www.ppi.gov.br/wp-json/" },
  { id: "P6", what: "ANTT 开放数据（公路 + 铁路）", url: "https://dados.antt.gov.br/api/3/action/status_show" },
  { id: "P7", what: "ANTAQ 门户（港口）", url: "https://portal.antaq.gov.br" },
  { id: "P9", what: "BNDES 项目中心（特许项目的结构化方）", url: "https://hubdeprojetos.bndes.gov.br/en/setores/Rodovias" },
  { id: "P5", what: "dados.gov.br 国家目录 —— 已知要巴西身份，留作对照", url: "https://dados.gov.br/api/3/action/status_show" },
  // Added 2026-09-19 after seven CLI rounds. These are the doors the laptop
  // CAN open (gov.br) and the two it cannot (the auction systems), asked from
  // here so the difference is attributable to the egress rather than to the
  // host. The two blocked ones are the point of the exercise: if this
  // deployment reaches leilao.antaq and leilao.aneel, the ports and
  // transmission connectors can run here on a schedule and the laptop's
  // network stops mattering at all.
  { id: "B1", what: "★ ANTAQ 拍卖系统详情页 —— 笔记本上是 Cloudflare 403", url: "https://leilao.antaq.gov.br/default.aspx?audiencia=175" },
  { id: "B2", what: "★ ANEEL 拍卖系统 —— 笔记本上两个大洲都 TCP 超时", url: "https://leilao.aneel.gov.br/editalTransmissao" },
  { id: "B3", what: "★ ANEEL 的 GitLab xlsx —— 笔记本上是 Cloudflare 硬封", url: "https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_transmissao.xlsx" },
  { id: "B4", what: "★ DOU 看报接口 —— 笔记本上两条路都被掐断", url: "https://www.in.gov.br/leiturajornal?secao=do3" },
  { id: "B5", what: "对照：ANTAQ 拍卖索引（笔记本能开，25 场真实拍卖）", url: "https://www.gov.br/antaq/pt-br/assuntos/leiloes" },
  { id: "B6", what: "对照：ANAC 开放数据目录（笔记本能开，里面有英文版 edital）", url: "https://sistemas.anac.gov.br/dadosabertos/AeroportosConcedidos/SETIMA_RODADA/" },
  { id: "B7", what: "对照：gov.br 上的 ANTAQ 标书草案 PDF（笔记本 659KB 下到了）", url: "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas/audiencias/teste/04-2026-vdc04/minuta-de-edital.pdf" },
];

const TIMEOUT_MS = 12_000;

/**
 * What a JSON door actually tells us.
 *
 * The first version printed `Object.keys(body)` and so reported E1 — the one
 * door the whole exercise was aimed at — as «JSON，外层键 help, success,
 * result». That is the CKAN envelope, identical for every CKAN call ever
 * made; it proves the host answered and says nothing about what it answered
 * WITH. The column names are the deliverable, because a mapper is written
 * from them, so `datastore_search` gets unwrapped one level further.
 */
function describeJson(trimmed: string): string {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return "JSON（解析失败）";
  }
  const result = body.result as Record<string, unknown> | undefined;
  if (result?.ckan_version) return `CKAN ${String(result.ckan_version)} — ${String(result.site_title ?? "")}`;

  const fields = result?.fields;
  if (Array.isArray(fields)) {
    const names = fields
      .map((field) => (field as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");
    const total = typeof result?.total === "number" ? result.total : null;
    return [
      total === null ? "datastore" : `datastore 共 ${total} 行`,
      `${names.length} 列：${names.join(" / ")}`,
    ].join(" · ");
  }
  return `JSON，外层键 ${Object.keys(body).slice(0, 10).join(", ")}`;
}

export async function knockDoor(door: Door): Promise<DoorResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(door.url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    const text = await response.text();
    const ms = Date.now() - started;
    if (!response.ok) {
      return { ...door, ms, verdict: `拒绝 ${response.status}`, detail: `${pageTitle(text) || visibleText(text).slice(0, 120) || "（空正文）"}` };
    }
    // A 200 is not a pass — see lib/ingestion/block-page.ts for the F5
    // appliance that serves its rejection page with one.
    const blocked = blockPageReason(text);
    if (blocked !== null) return { ...door, ms, verdict: "200 但是拦截页", detail: `「${blocked}」${pageTitle(text) ? ` · ${pageTitle(text)}` : ""}` };
    const trimmed = text.trim();
    // `%PDF-` is the first five bytes of every PDF. The HTML describer called
    // a 659KB PDF "a page that is nearly empty" once already; it has no
    // business judging bytes it cannot parse.
    if (trimmed.startsWith("%PDF-")) {
      return { ...door, ms, verdict: "通了 ★", detail: `真的 PDF（${Math.round(text.length / 1024)}KB）—— 文件下下来了，不是页面` };
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return { ...door, ms, verdict: "通了 ★", detail: describeJson(trimmed) };
    }
    const body = visibleText(text);
    const links = (text.match(/<a\b[^>]*href="/gi) ?? []).length;
    const thin = body.length < 800 || links < 5;
    return {
      ...door,
      ms,
      verdict: thin ? "200，但页面几乎是空的" : "通了 ★",
      detail: `${Math.round(text.length / 1024)}KB · 正文 ${body.length} 字 · ${links} 个链接${pageTitle(text) ? ` · ${pageTitle(text)}` : ""}`,
    };
  } catch (err) {
    // The whole cause chain. "fetch failed" alone cannot distinguish DNS from
    // TLS from a reset from a connect timeout, and those need four different
    // answers — the lesson lib/fetch-failure.ts exists for.
    return { ...door, ms: Date.now() - started, verdict: "连不上", detail: describeFetchFailure(err).slice(0, 220) };
  } finally {
    clearTimeout(timer);
  }
}

export async function knockAllDoors(): Promise<DoorResult[]> {
  const results: DoorResult[] = [];
  for (const door of BRAZIL_DOORS) results.push(await knockDoor(door));
  return results;
}

/**
 * @param where names the machine that did the knocking. It is not decoration:
 *   the whole point of running this twice is that the answers differ by
 *   egress, so a report that does not say which egress produced it is
 *   unusable the moment there are two of them.
 */
export function renderDoorReport(results: DoorResult[], where: string): string {
  const opened = results.filter((r) => r.verdict.includes("★"));
  return [
    `巴西特许经营 / 输电拍卖 —— 从【${where}】这一侧敲门`,
    "",
    "问的不是「有没有接口」，那个上一轮问过了。问的是「我们能控制的机器里，有没有一台够得着」。",
    "笔记本那边：dadosabertos.aneel 在 socket 层就超时，ANEEL/ANTAQ 是 Cloudflare 的 JS 验证，",
    "dados.gov.br 要巴西身份才能注册。",
    "",
    "─".repeat(72),
    "",
    ...results.map((r) => [
      `${r.id}  ${r.what}`,
      `    ${r.url}`,
      `    ${r.verdict.padEnd(18)} ${String(r.ms).padStart(6)}ms  ${r.detail}`,
      "",
    ].join("\n")),
    "─".repeat(72),
    "",
    opened.length > 0
      ? `有 ${opened.length} 个门从【${where}】这边是通的：${opened.map((r) => r.id).join("、")}。\n只有跑连接器的那台机器答「通」才算数 —— 定时任务在 GitHub Actions 上，不在 Vercel 上。`
      : `从【${where}】一个都没通。那就不是网络出口的问题，是这些站点整体拒绝非浏览器访问 ——\n下一步应该走「你在浏览器里手动导出、我照着真实文件写映射器」那条路（Compras MX、\nEcopetrol、Proyectos México 都是这么做的），而不是去折腾无头浏览器。`,
  ].join("\n");
}
