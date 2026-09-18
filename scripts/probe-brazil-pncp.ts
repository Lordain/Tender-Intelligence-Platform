/**
 * Is Brazil's PNCP actually usable, and what does it really return?
 *
 * PNCP (Portal Nacional de Contratações Públicas) is the right source for
 * Brazil and the other two candidates are not — see this file's report text
 * and lib/ingestion/README.md. What is NOT settled is whether we can read it.
 *
 * The history, from lib/ingestion/README.md (2026-09, user's own browser,
 * since this sandbox reaches no gov host):
 *
 *   - `GET /v1/pncp/v1/modalidades?statusAtivo=true` answered INSTANTLY with
 *     19 real modality codes. So the domain, the base path and the lack of
 *     authentication are all confirmed real.
 *   - `GET /v1/contratacoes/publicacao` returned a real 504 Gateway Time-out
 *     on two separate attempts, including the narrowest reasonable request
 *     (one day, tamanhoPagina=5, a rare modality expected to return almost
 *     nothing). Not a parameter mistake — a reliability problem with that
 *     one endpoint.
 *
 * What is new (2026-09-18, from the user's screenshot of PNCP's own Swagger
 * at /pncp-consulta/v3/api-docs): an endpoint the earlier attempt never
 * tried — `/v1/contratacoes/proposta`, "Consultar Contratações com
 * Recebimento de Propostas Aberto". Tenders whose proposal window is OPEN is
 * both exactly what this platform sells and a naturally far smaller result
 * set than "everything published in a date range", so it is the one most
 * likely to answer where /publicacao times out.
 *
 * ── FIRST RUN (2026-09-18, user's machine) ────────────────────────────────
 *
 *   modalidades (control)              200   3,922ms   19 rows
 *   /contratacoes/proposta   mod 6     timeout >60s
 *   /contratacoes/publicacao mod 6     timeout >60s
 *   /contratacoes/proposta   mod 4     500    52,374ms
 *                                      "Erro na comunicação com o banco de dados."
 *
 * The 500 is the useful one. It is PNCP's own application saying its database
 * layer failed — not a WAF, not our parameters (PNCP has a separate
 * RespostaErroValidacaoDTO for those), not this machine's network, since the
 * control answered from it in under four seconds. So the two timeouts are the
 * same fault, and the README's earlier finding understates it: this is not
 * /publicacao alone, it is every contratacoes consultation endpoint.
 *
 * What that leaves worth testing, and why this script now runs a matrix:
 * dying at 52s inside the database looks like an unbounded scan. PNCP holds
 * every contracting process in Brazil, federal through municipal, so a query
 * bounded only by modality and a date could be reading an enormous table.
 * Bounding it by UF, by a narrower page, or by both, is the one hypothesis
 * left that our own code can act on. And a 200 that takes 90 seconds is still
 * usable by a nightly import, so the timeout is raised to tell "slow" from
 * "broken" instead of calling both a failure.
 *
 * This script tries them in that order and reports timings, so a failure
 * says WHICH endpoint failed rather than "Brazil doesn't work".
 *
 * The modalities call is the CONTROL GROUP, same discipline as
 * probe-colombia-sources.ts: it is known to answer. If the control fails
 * too, the problem is this machine's network and every other result here is
 * meaningless — the report says so rather than letting you read timeouts as
 * findings.
 *
 * ── SECOND RUN (2026-09-18, the matrix below) ─────────────────────────────
 *
 * The matrix answered, and it overturned the conclusion above: PNCP is slow,
 * not broken. `proposta mod=6` returned 200 in 63,101ms with
 * totalRegistros=1457 — every earlier "timeout" was this script's own 60s
 * cutoff. And the hypothesis the matrix was built to test is backwards: `uf`
 * is what BREAKS it (500, "Failed to obtain JDBC Connection ... Hikari",
 * three for three across two modalities and two endpoints), as is
 * `dataInicial`. Hikari is a connection pool, so the 500 means no database
 * connection was free, not that the query was too broad. A connector must
 * send the BROAD query and filter on our side.
 *
 * Follow-on work lives in scripts/dump-brazil-pncp-rows.ts, which fetches the
 * real row values a mapper has to be written from, and sweeps every modality
 * WITHOUT `uf` — including Concorrência Eletrônica, which this matrix only
 * ever tried in the shape now known to fail.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-pncp
 *   npm run probe:brazil-pncp -- --days 3
 */
// This file imports nothing, which without the export below would make it a
// global script rather than a module — and its `main` would then collide at
// compile time with probe-colombia-sources.ts's. tsc caught it; the fix is to
// say out loud that this is a module.
export {};

const BASE = "https://pncp.gov.br/api/consulta";
/** Not under /api/consulta — it is the reference-data service, and that difference is why the earlier session could reach one and not the other. */
const MODALIDADES_URL = "https://pncp.gov.br/api/pncp/v1/modalidades?statusAtivo=true";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  // Same posture as the Peru connector: identify honestly rather than
  // impersonate a browser. A public open-data API wants to know who is
  // calling, and .gov.br sits behind a WAF that answers 403 to a request
  // with no User-Agent at all — which is what Node's fetch sends.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** PNCP wants YYYYMMDD, not ISO — a detail worth getting wrong only once. */
function pncpDay(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

type Attempt = { label: string; url: string; ok: boolean; status: number | string; ms: number; note: string };

/**
 * 120s by default, not 60. The first run called a 60s cutoff a failure, and a
 * response that takes 90 seconds is not a failure for a nightly import that
 * pages through once — it is a slow endpoint we can schedule around. Telling
 * those two apart is the whole point of raising it.
 */
let TIMEOUT_MS = 120_000;

async function attempt(label: string, url: string, timeoutMs = TIMEOUT_MS): Promise<Attempt> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const ms = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { label, url, ok: false, status: response.status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { label, url, ok: false, status: response.status, ms, note: `返回的不是 JSON：${text.slice(0, 160)}` };
    }
    return { label, url, ok: true, status: response.status, ms, note: describe(parsed) };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { label, url, ok: false, status: message.includes("abort") ? `超时 >${timeoutMs / 1000}s` : "连接失败", ms, note: message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The shape and the FIELD NAMES of the first row.
 *
 * Field names are the deliverable here. A mapper cannot be written from a
 * Swagger screenshot — every mapper in this project was written against real
 * returned rows, and the one time that rule was bent (Colombia's document
 * ids) it cost a bulk run that matched 0 of 440 candidates.
 */
function describe(body: unknown): string {
  if (Array.isArray(body)) {
    return `数组，${body.length} 项${body.length > 0 ? `。第一项字段：${Object.keys(body[0] as object).join(", ")}` : ""}`;
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const meta = ["totalRegistros", "totalPaginas", "numeroPagina", "paginasRestantes", "empty"]
      .filter((k) => k in record)
      .map((k) => `${k}=${String(record[k])}`)
      .join("  ");
    const rows = record.data;
    if (Array.isArray(rows)) {
      const first = rows[0] as Record<string, unknown> | undefined;
      return `${meta}\n      data[] ${rows.length} 行${first ? `\n      字段：${Object.keys(first).join(", ")}` : "（本页为空）"}`;
    }
    return `对象，键：${Object.keys(record).join(", ")}`;
  }
  return String(body).slice(0, 120);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const days = Math.max(1, Number(arg("--days") ?? 3) || 3);
  const timeoutSeconds = Math.max(10, Number(arg("--timeout") ?? 120) || 120);
  TIMEOUT_MS = timeoutSeconds * 1000;
  /** Brazil's largest state by procurement volume — a bound that still returns real rows if anything does. */
  const uf = (arg("--uf") ?? "SP").toUpperCase();

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  const d0 = pncpDay(from);
  const d1 = pncpDay(now);

  console.log(`PNCP 探针 — 窗口 ${d0} 到 ${d1}（${days} 天），每条最多等 ${timeoutSeconds}s\n`);

  const results: Attempt[] = [];
  const run = async (label: string, url: string) => {
    const r = await attempt(label, url);
    results.push(r);
    console.log(`  ${r.ok ? "OK  " : "FAIL"}  ${String(r.status).padEnd(12)} ${String(r.ms).padStart(7)}ms`);
    console.log(`        ${r.note.replace(/\n/g, "\n        ")}\n`);
    return r;
  };

  // The control. Known to answer; if it stops answering, nothing below means
  // anything and the report has to say so rather than let a timeout read as a
  // fact about PNCP.
  console.log("【对照组】modalidades —— 已知可用。这条挂了，下面全部作废。");
  const control = await run("modalidades（对照组）", MODALIDADES_URL);
  if (!control.ok) {
    console.log("对照组失败 —— 这台机器连 PNCP 已知可用的端点都读不到。先解决网络，再跑一次。\n");
    return;
  }

  // The matrix. Each row removes one more degree of freedom from the query, so
  // whichever row first answers names the bound that made it answerable.
  const base = `${BASE}/v1/contratacoes`;
  console.log("【1】原样复测（更长的超时）—— 区分「慢」和「坏」");
  await run("proposta mod=6 (120s)", `${base}/proposta?dataFinal=${d1}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`);

  console.log(`【2】加上州边界 uf=${uf} —— 如果 52s 死在数据库是全表扫描，这一条该活`);
  await run(`proposta mod=6 uf=${uf}`, `${base}/proposta?dataFinal=${d1}&codigoModalidadeContratacao=6&uf=${uf}&pagina=1&tamanhoPagina=10`);

  console.log("【3】再窄一格：一页只要 1 条");
  await run(`proposta mod=6 uf=${uf} size=1`, `${base}/proposta?dataFinal=${d1}&codigoModalidadeContratacao=6&uf=${uf}&pagina=1&tamanhoPagina=1`);

  console.log("【4】/proposta 也给日期下界（截图的 Swagger 没写清是否必填）");
  await run("proposta mod=6 + dataInicial", `${base}/proposta?dataInicial=${d0}&dataFinal=${d1}&codigoModalidadeContratacao=6&uf=${uf}&pagina=1&tamanhoPagina=10`);

  console.log("【5】Concorrência Eletrônica（大工程走这条），带州边界");
  await run(`proposta mod=4 uf=${uf}`, `${base}/proposta?dataFinal=${d1}&codigoModalidadeContratacao=4&uf=${uf}&pagina=1&tamanhoPagina=10`);

  console.log("【6】/publicacao 带州边界 —— README 里记着它 504 过两次");
  await run(`publicacao mod=6 uf=${uf}`, `${base}/publicacao?dataInicial=${d0}&dataFinal=${d1}&codigoModalidadeContratacao=6&uf=${uf}&pagina=1&tamanhoPagina=10`);

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const r of results) {
    console.log(`  ${(r.ok ? "OK  " : "FAIL").padEnd(5)} ${String(r.status).padEnd(14)} ${String(r.ms).padStart(7)}ms  ${r.label}`);
  }
  console.log();

  const wins = results.filter((r) => r.ok && r !== control);
  if (wins.length > 0) {
    console.log(`有 ${wins.length} 条通了。最窄的那条就是 connector 该用的查询形状：`);
    for (const w of wins) console.log(`  ${w.ms}ms  ${w.label}`);
    console.log("\n把上面打印的【字段】清单发我 —— mapper 按真实返回字段写，不按 Swagger 截图写。");
    console.log("再按那个标题字段抓 30~50 条真实葡语标题，葡语规则就有依据了。");
  } else {
    console.log("加了州边界、缩到一页一条、补了日期下界，全都不通 —— 那就不是查询形状的问题。");
    console.log("PNCP 的 consultas 服务现在读不了它自己的数据库，我们这边写什么代码都没用。");
    console.log("建议：巴西先搁置，改做智利（任务 #13）；过几天再跑一次这个探针确认。");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
