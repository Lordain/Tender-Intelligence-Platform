/**
 * Brazil has more than one door. This knocks on the other ones.
 *
 * Everything so far has gone through PNCP's `/api/consulta`, and that one
 * endpoint has now failed four different ways in two days: 63-second
 * responses, a total 503 outage, a rate limiter that trips at roughly ten
 * requests in five seconds, and 500 "Erro na comunicação com o banco de
 * dados" / 504 within the same hour. Before a connector is built on it, it is
 * worth knowing what else exists — the question the user asked 2026-09-18.
 *
 * ── FIRST RUN (2026-09-18) — five out of five failed, and two of those were
 *    this script's fault ─────────────────────────────────────────────────────
 *
 *   A1/A2 /api/search           连接失败  fetch failed   (1137ms / 577ms)
 *   A3   /api/consulta          504       70,762ms
 *   B    dadosabertos           404       1,202ms   "Resource not found"
 *   D    Querido Diário         520       31,802ms  Cloudflare
 *
 * Read honestly, only A3 was a finding. The other three were bad questions:
 *
 *   - B's 404 came back in 1.2 seconds, which means the host is UP and
 *     answering — it was the PATH that was wrong, and the path was one this
 *     file guessed. Fixed by asking the API for its own path list (see the
 *     api-docs step) instead of guessing a second time.
 *   - D used `queridodiario.ok.org.br/api/gazettes`, the front-end host. The
 *     API is served from `api.queridodiario.ok.org.br/gazettes`; the 520 was
 *     Cloudflare on a host that does not serve that path.
 *   - A1/A2 said `fetch failed`, which is Node's catch-all for DNS, TLS,
 *     reset and refused alike — and the real reason was sitting in
 *     `err.cause`, unprinted. Now printed, via lib/fetch-failure.ts. That
 *     matters here more than anywhere: A3 reached the SAME HOST in the same
 *     run and got an HTTP response, so whatever stopped A1 was specific to
 *     that path or that connection, and the cause chain is the only thing
 *     that can say which.
 *
 * The four candidates, and what is actually known about each (from public
 * documentation and third-party code — pncp.gov.br and every other .gov.br
 * host is blocked from this sandbox, which is why this is a script for the
 * user to run rather than a finding):
 *
 *   A. pncp.gov.br/api/search — THE INTERESTING ONE.
 *      What the PNCP website's own search box calls (pncp.gov.br/app/editais),
 *      and what several third-party collectors use directly:
 *      `?q=<termo>&tipos_documento=edital&ordenacao=-data&pagina=1
 *      &tam_pagina=100`, plus `municipios=` / `ufs=`.
 *      Three reasons it matters: it is almost certainly a search index rather
 *      than the relational database whose Hikari pool produces
 *      /api/consulta's 500s, so the two should fail independently;
 *      `tam_pagina=100` against /consulta's 10–50 is a quarter of the
 *      requests for the same coverage, which is the direct answer to the rate
 *      limiter; and `q=` is server-side keyword filtering, which no other
 *      source in this project offers.
 *      The catch, and the reason this probe prints whole rows: a search index
 *      usually returns a SUMMARY. If `valorTotalEstimado` and the cronograma
 *      dates are missing, it is a discovery endpoint that still needs
 *      /consulta for the money — usable, but a different design. Fields
 *      decide that, nothing else.
 *
 *   B. dadosabertos.compras.gov.br — Compras.gov.br open data (SIASG).
 *      A genuinely separate API, own Swagger, no auth. FEDERAL ONLY: no state
 *      or municipal procurement, which PNCP does carry. A complement and a
 *      cross-check, never a replacement.
 *
 *   C. contratos.comprasnet.gov.br/api — federal CONTRACTS already signed.
 *      Wrong half of the lifecycle for the main feed; relevant later for
 *      award outcomes. Not probed here.
 *
 *   D. api.queridodiario.ok.org.br — municipal official gazettes, full text,
 *      open, self-declared ~60 req/min. The Brazilian analogue of the DOF
 *      connector: it reaches municipalities that never publish to PNCP at
 *      all, but returns gazette prose rather than structured tenders, so it
 *      carries the same extraction problem the DOF mapper solves — in
 *      Portuguese.
 *
 * This script does not pick one. It prints status, latency, the real field
 * names and the first row, so the choice is made against returned data.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-alt
 *   npm run probe:brazil-alt -- --q "obra" --timeout 120
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

type Result = { label: string; url: string; ok: boolean; status: number | string; ms: number; note: string; first?: Record<string, unknown> };

/**
 * A browser's headers, used for ONE diagnostic request only.
 *
 * This project's standing posture is to identify honestly rather than
 * impersonate a browser, and that is not changing here. But A1/A2 came back
 * `fetch failed` from the same host that answered A4 in the same run, and a
 * WAF closing the connection on an unfamiliar User-Agent for one path is a
 * real candidate for that. It is a variable worth isolating: if this is what
 * decides it, that is a finding to discuss, not a header to quietly ship.
 */
const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Referer: "https://pncp.gov.br/app/editais",
} as const;

async function fetchText(url: string, timeoutMs: number, headers: Record<string, string> = HEADERS): Promise<{ status: number | string; ms: number; text: string; failure?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return { status: response.status, ms: Date.now() - started, text: await response.text() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败",
      ms: Date.now() - started,
      text: "",
      // The whole cause chain. "fetch failed" on its own is not a finding.
      failure: describeFetchFailure(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(label: string, url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Result> {
  const { status, ms, text, failure } = await fetchText(url, timeoutMs, headers);
  if (failure !== undefined) return { label, url, ok: false, status, ms, note: failure.slice(0, 260) };
  if (typeof status === "number" && (status < 200 || status >= 300)) {
    return { label, url, ok: false, status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) };
  }
  if (status === 204 || text.trim() === "") return { label, url, ok: true, status, ms, note: "答了，但是空的（没有匹配的记录）" };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { label, url, ok: false, status, ms, note: `返回的不是 JSON：${text.slice(0, 160)}` };
  }
  // Each of these APIs wraps its rows differently, and guessing the wrapper is
  // how a working endpoint gets reported as empty. Try the known shapes, then
  // describe the envelope rather than claim there is nothing in it.
  const record = body as Record<string, unknown>;
  const rows = (Array.isArray(body) ? body : record.data ?? record.items ?? record.resultado ?? record.gazettes ?? record.content ?? record.resultados) as unknown[] | undefined;
  const total = record.total ?? record.totalRegistros ?? record.totalElements ?? record.total_gazettes ?? (Array.isArray(rows) ? rows.length : undefined);
  if (!Array.isArray(rows)) {
    return { label, url, ok: true, status, ms, note: `答了，但没认出行在哪：外层键 ${Object.keys(record).join(", ")}` };
  }
  const first = rows[0] as Record<string, unknown> | undefined;
  return { label, url, ok: true, status, ms, note: `${total ?? "?"} 条，本页 ${rows.length} 行`, ...(first ? { first } : {}) };
}

function pncpDay(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Ask an API for its own path list rather than guessing one.
 *
 * The first run guessed a dadosabertos path and got a 404 in 1.2 seconds — a
 * live host answering a wrong question. This project's own rule for mappers
 * ("real returned rows, not a Swagger screenshot") applies just as well to
 * paths: read them out of the OpenAPI document the service publishes.
 */
async function listPaths(base: string, match: RegExp, timeoutMs: number): Promise<string[] | null> {
  for (const docPath of ["/v3/api-docs", "/v2/api-docs", "/openapi.json"]) {
    const { status, text } = await fetchText(`${base}${docPath}`, timeoutMs);
    if (status !== 200 || !text.trim().startsWith("{")) continue;
    try {
      const doc = JSON.parse(text) as { paths?: Record<string, unknown> };
      const paths = Object.keys(doc.paths ?? {});
      if (paths.length > 0) {
        console.log(`   （从 ${docPath} 读到 ${paths.length} 个路径）`);
        return paths.filter((p) => match.test(p));
      }
    } catch {
      // Not an OpenAPI document after all; try the next candidate.
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 120) || 120) * 1000;
  const q = arg("--q") ?? "obra";
  const today = pncpDay(new Date());
  const pause = () => new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`巴西其他数据接口 — 关键词 "${q}"，每条最多等 ${Math.round(timeoutMs / 1000)}s\n`);

  const results: Result[] = [];
  const run = async (label: string, why: string, url: string, headers?: Record<string, string>) => {
    console.log(label);
    console.log(`   为什么试它：${why}`);
    console.log(`   ${url}`);
    const result = await probe(label, url, timeoutMs, headers);
    results.push(result);
    console.log(`   ${result.ok ? "OK  " : "FAIL"}  ${String(result.status).padEnd(12)} ${String(result.ms).padStart(7)}ms  ${result.note}`);
    if (result.first) {
      console.log(`   字段：${Object.keys(result.first).join(", ")}`);
      console.log("   第一行全文：");
      console.log(
        JSON.stringify(result.first, null, 2)
          .split("\n")
          .map((line) => `     ${line}`)
          .join("\n"),
      );
    }
    console.log();
    await pause();
    return result;
  };

  // ── A. PNCP's own search index ───────────────────────────────────────────
  // Both spellings, because the first run's `fetch failed` never said whether
  // the path, the redirect or the connection was the problem — and a trailing
  // slash is exactly the kind of thing that decides it.
  await run(
    "A1. PNCP /api/search（网站自己的搜索，带关键词）",
    "跟 /api/consulta 大概率不是同一个后端 —— 那边挂了这边可能还活着",
    `https://pncp.gov.br/api/search/?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10`,
  );
  await run(
    "A2. PNCP /api/search（同上，但网址结尾不带斜杠）",
    "上一轮两条都 fetch failed，而同一次运行里 /api/consulta 从同一个域名拿到了 HTTP 响应 —— 先排除是这一个斜杠的事",
    `https://pncp.gov.br/api/search?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10`,
  );
  await run(
    "A3. PNCP /api/search（不带关键词，只按日期倒序）",
    "确认 q 是可选的；这才是每日全量导入会用的形状",
    "https://pncp.gov.br/api/search?tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10",
  );
  await run(
    "A4. PNCP /api/consulta（对照组，已知的那条）",
    "同一次运行里对比 —— 快慢和字段完整度都得跟 A1~A3 摆在一起看",
    `https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=${today}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`,
  );

  await run(
    "A5. PNCP /api/search（换成浏览器的请求头 —— 只为定位问题）",
    "A1~A3 连不上、A4 同一个域名却有响应。先把「对方防火墙认不认我们的 User-Agent」这个变量单独试出来；如果就是它，那是个要讨论的结论，不是偷偷改个 header 就完事",
    "https://pncp.gov.br/api/search?tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10",
    BROWSER_HEADERS,
  );

  // ── B. Compras.gov.br open data ──────────────────────────────────────────
  console.log("B. Compras.gov.br 开放数据（联邦，SIASG）");
  console.log("   为什么试它：独立的一套 API。只有联邦，没有州和市 —— 是补充不是替代");
  console.log("   上一轮我猜了个路径，1.2 秒就回了 404 —— 主机是活的，错的是路径。这次先问它自己有哪些路径。");
  const comprasBase = "https://dadosabertos.compras.gov.br";
  const comprasPaths = await listPaths(comprasBase, /contrata|licita/i, timeoutMs);
  if (comprasPaths === null) {
    console.log("   读不到它的 OpenAPI 文档 —— 下面退回用第三方文档里出现过的那条真实路径。\n");
  } else {
    console.log(`   跟招标/合同有关的路径共 ${comprasPaths.length} 条：`);
    for (const path of comprasPaths.slice(0, 40)) console.log(`     ${path}`);
    console.log();
  }
  await pause();
  await run(
    "B1. Compras.gov.br — modulo-legado/1_consultarLicitacao",
    "这条路径在第三方文档里出现过实例，不是我猜的",
    `${comprasBase}/modulo-legado/1_consultarLicitacao?pagina=1&tamanhoPagina=10`,
  );

  // ── D. Querido Diário ────────────────────────────────────────────────────
  await run(
    "D. Querido Diário（市级公报全文）",
    "相当于墨西哥的 DOF：够得着根本不上 PNCP 的小城市，但返回的是公报正文不是结构化标讯。上一轮我用错了主机（前端域名），这次用 API 域名",
    `https://api.queridodiario.ok.org.br/gazettes?querystring=${encodeURIComponent(q)}&size=5`,
  );

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const r of results) {
    console.log(`  ${(r.ok ? "OK  " : "FAIL").padEnd(5)} ${String(r.status).padEnd(12)} ${String(r.ms).padStart(7)}ms  ${r.label}`);
  }
  console.log();
  const pncpSearch = results.filter((r) => /^A[1235]\./.test(r.label));
  if (pncpSearch.some((r) => r.ok)) {
    console.log("把 /api/search 那几段的【字段】和【第一行全文】发我。要判断的就一件事：");
    console.log("  它返回的是完整记录，还是只是个搜索摘要？");
    console.log("  有 valorTotalEstimado、收标截止日期、采购单位 → 它可以整个替掉 /api/consulta；");
    console.log("  只有标题和链接 → 它负责发现，金额还得回 /api/consulta 取，那是另一种设计。");
  } else {
    console.log("/api/search 三种写法都没通。把上面每条 FAIL 后面那串「A ← B ← C」发我 —— 那是错误链，");
    console.log("它会说清到底是 DNS、TLS、连接被重置，还是对方直接拒了，这四种要改的地方完全不一样。");
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
