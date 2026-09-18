import { getAdminUser } from "@/lib/admin-auth";
import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";

/**
 * The same doors as `npm run probe:brazil-concessions`, knocked on from the
 * DEPLOYMENT instead of a laptop.
 *
 * Why this route exists, specifically: run two established that the laptop's
 * network is a real part of the problem, not an incidental one.
 * `dadosabertos.aneel.gov.br` timed out at the socket after 21 seconds with
 * no handshake while eight other hosts connected in under 400ms, and ANEEL's
 * and ANTAQ's Cloudflare challenges plus CCEE's hand-written "Acesso
 * bloqueado" page are all the kind of refusal that is commonly decided by
 * where the request comes from. Then dados.gov.br — the one door that was
 * only a credential away — turned out to need a Brazilian CPF to register,
 * which closes it for this user entirely.
 *
 * So the open question is no longer "does an API exist" but "can anything we
 * control reach it". This deployment is a second network with a different
 * egress, it already reaches PNCP, and asking it costs one route. If the
 * answer is yes, a connector can run here on a schedule and the laptop's
 * network stops mattering. If it is no, that is equally worth knowing before
 * anyone builds a headless-browser workaround for a host that would refuse a
 * browser too.
 *
 * Read-only: GET, no writes, no Supabase, no model calls. Plain text rather
 * than JSON because it is meant to be opened in a logged-in browser tab and
 * read, and the report IS the deliverable.
 */
export const maxDuration = 120;

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

/** One check per door. `note` is written for the person reading the page. */
const DOORS: { id: string; what: string; url: string }[] = [
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
];

const TIMEOUT_MS = 12_000;

type Result = { id: string; what: string; url: string; verdict: string; detail: string; ms: number };

async function knock(door: { id: string; what: string; url: string }): Promise<Result> {
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
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      let summary = "";
      try {
        const body = JSON.parse(trimmed) as Record<string, unknown>;
        const result = body.result as Record<string, unknown> | undefined;
        summary = result?.ckan_version ? `CKAN ${String(result.ckan_version)} — ${String(result.site_title ?? "")}` : `JSON，外层键 ${Object.keys(body).slice(0, 10).join(", ")}`;
      } catch {
        summary = "JSON（解析失败）";
      }
      return { ...door, ms, verdict: "通了 ★", detail: summary };
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

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return new Response("unauthorized", { status: 403 });

  const results: Result[] = [];
  for (const door of DOORS) results.push(await knock(door));

  const opened = results.filter((r) => r.verdict.includes("★"));
  const lines = [
    "巴西特许经营 / 输电拍卖 —— 从【服务器】这一侧敲门",
    "",
    "问的不是「有没有接口」，那个上一轮问过了。问的是「我们能控制的机器里，有没有一台够得着」。",
    "笔记本那边：dadosabertos.aneel 在 socket 层就超时，ANEEL/ANTAQ 是 Cloudflare 的 JS 验证，",
    "dados.gov.br 要巴西身份才能注册。这台服务器是另一个出口，它已经能连上 PNCP。",
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
      ? `有 ${opened.length} 个门从服务器这边是通的：${opened.map((r) => r.id).join("、")}。\n把这一页发我 —— 通的那几个就是连接器要走的路，而且可以跑在定时任务里，跟你本地网络无关了。`
      : "一个都没通。那就不是网络出口的问题，是这些站点整体拒绝非浏览器访问 —— \n下一步应该走「你在浏览器里手动导出、我照着真实文件写映射器」那条路（Compras MX、\nEcopetrol、Proyectos México 都是这么做的），而不是去折腾无头浏览器。",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
