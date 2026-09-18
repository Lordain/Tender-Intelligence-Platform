/**
 * PNCP answers. Now find out what it actually says.
 *
 * `probe:brazil-pncp` settled the question the README had wrong. Run
 * 2026-09-18 on the user's machine:
 *
 *   modalidades (control)            200    1,398ms   19 rows
 *   proposta mod=6                   200   63,101ms   totalRegistros=1457, 146 pages
 *   proposta mod=6 uf=SP             500   54,135ms   "Failed to obtain JDBC Connection ... Hikari"
 *   proposta mod=6 uf=SP size=1      400      628ms   "deve ser maior que ou igual à 10"
 *   proposta mod=6 + dataInicial     500   30,449ms   "Erro na comunicação com o banco de dados."
 *   proposta mod=4 uf=SP             500   61,448ms   Hikari
 *   publicacao mod=6 uf=SP           500   47,000ms   Hikari
 *
 * Three findings, and two of them are the opposite of what the matrix was
 * built to test:
 *
 *   1. The endpoint is SLOW, not broken. 63 seconds is fine for a nightly
 *      import that pages through once. Every earlier "timeout" was our own
 *      60s cutoff, and the README's "every contratacoes endpoint is down" is
 *      simply wrong — retracted there.
 *   2. NARROWING THE QUERY IS WHAT KILLS IT. `uf` did not help, it converted
 *      a working 63s call into a 500 every single time it appeared — three
 *      for three, across two modalities and two endpoints, while the one
 *      call without it succeeded. Hikari is a JDBC connection POOL, so that
 *      500 is "no database connection was free", not "your query was too
 *      big". The connector must therefore send the BROAD query and filter on
 *      our side. That is backwards from every other source in this project
 *      and is the single most important thing to not re-litigate later.
 *   3. `dataInicial` is likewise poison (500). `dataFinal` alone is what the
 *      working call sent.
 *
 * So the proven shape, and the only one this script uses:
 *
 *   GET /api/consulta/v1/contratacoes/proposta
 *       ?dataFinal=YYYYMMDD&codigoModalidadeContratacao=N&pagina=N&tamanhoPagina=>=10
 *
 * What is still missing is everything a mapper needs. The probe printed
 * top-level FIELD NAMES only, and names are not a contract: `orgaoEntidade`
 * and `unidadeOrgao` are nested objects whose shape nobody here has seen,
 * and no date, money or status field has had a single real VALUE looked at.
 * Writing a mapper from a field list is the same shortcut that cost a bulk
 * run matching 0 of 440 Colombian candidates. So this script exists to be
 * run once, and it produces the two things that unblock the work:
 *
 *   A. The first row, printed as complete raw JSON — nested objects included.
 *      That is the mapper's ground truth.
 *   B. 30–50 real `objetoCompra` titles in Portuguese, exported to CSV. That
 *      is what the deferred Portuguese ruleset has been waiting on: the
 *      README measured Spanish rules agreeing with Portuguese ones 6/10 with
 *      every failure in the dangerous direction, and an excluded tender is
 *      never written to Supabase, so those rules have to land BEFORE the
 *      first import.
 *
 * It also fills the one cell the matrix left empty. Both mod=4 attempts
 * carried `uf`, which is now known to be the thing that fails — so
 * Concorrência Eletrônica, the modality that carries the large public works
 * this platform actually sells, has never been tried in the shape that
 * works. The count sweep below tries every modality without it.
 *
 * Read-only. No Supabase, no writes to any remote, no model calls.
 *
 * Usage:
 *   npm run dump:brazil-pncp                  # every modality — slow, see the estimate it prints
 *   npm run dump:brazil-pncp -- --only 6,4    # just Pregão + Concorrência (~2 min)
 *   npm run dump:brazil-pncp -- --titles 50 --timeout 180
 */
import { toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";

const BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes";
const MODALIDADES_URL = "https://pncp.gov.br/api/pncp/v1/modalidades?statusAtivo=true";
const OUT_DIR = "exports";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  // Identify honestly rather than impersonate a browser, same as the Peru
  // connector. .gov.br sits behind a WAF that answers 403 to a request with
  // no User-Agent at all, which is what Node's fetch sends.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** PNCP wants YYYYMMDD, not ISO. */
function pncpDay(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

type Fetched = { ok: boolean; status: number | string; ms: number; body: unknown; note: string };

async function get(url: string, timeoutMs: number): Promise<Fetched> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const ms = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, ms, body: null, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) };
    }
    try {
      return { ok: true, status: response.status, ms, body: JSON.parse(text), note: "" };
    } catch {
      return { ok: false, status: response.status, ms, body: null, note: `返回的不是 JSON：${text.slice(0, 120)}` };
    }
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败", ms, body: null, note: message.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 502/503/504 and outright connection failures are the load balancer saying
 * it has no healthy backend behind it, which PNCP's consultas service does
 * intermittently — on 2026-09-18 a run that had succeeded hours earlier came
 * back `fetch failed` once and then 503 "No server is available to handle
 * this request" nineteen times in a row, each in under 250ms, while
 * /modalidades (a different service) still answered. Those are worth waiting
 * out; a 400 is our parameters and a 500 is their database, and neither gets
 * better by asking again.
 */
const TRANSIENT = new Set([502, 503, 504]);
const BACKOFF_MS = [5_000, 20_000];

async function getResilient(url: string, timeoutMs: number): Promise<Fetched> {
  let last = await get(url, timeoutMs);
  for (const wait of BACKOFF_MS) {
    const transient = last.status === "连接失败" || (typeof last.status === "number" && TRANSIENT.has(last.status));
    if (last.ok || !transient) return last;
    console.log(`        ${last.status} —— 等 ${wait / 1000}s 再试一次`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    last = await get(url, timeoutMs);
  }
  return last;
}

type Page = { data?: unknown[]; totalRegistros?: number; totalPaginas?: number; numeroPagina?: number; empty?: boolean };

/**
 * One page of /proposta.
 *
 * `tamanhoPagina` is tried at the caller's size first and retried at 10 on a
 * 400. The matrix proved 1 is rejected ("deve ser maior que ou igual à 10")
 * but never established the ceiling, and a guessed ceiling that 400s would
 * otherwise read as "this modality is broken".
 */
async function fetchPage(modalidade: number, dataFinal: string, pagina: number, size: number, timeoutMs: number): Promise<{ page: Page | null; size: number; result: Fetched }> {
  const url = (s: number) => `${BASE}/proposta?dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${s}`;
  let used = size;
  let result = await getResilient(url(used), timeoutMs);
  if (!result.ok && result.status === 400 && used > 10) {
    console.log(`        tamanhoPagina=${used} 被拒（${result.note}）—— 退回 10 重试`);
    used = 10;
    result = await getResilient(url(used), timeoutMs);
  }
  return { page: result.ok ? (result.body as Page) : null, size: used, result };
}

/** Flattens nested objects one level so a CSV column can show `orgaoEntidade.razaoSocial` without the mapper existing yet. */
function pick(row: Record<string, unknown>, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), row);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 180) || 180) * 1000;
  const wantTitles = Math.max(1, Number(arg("--titles") ?? 50) || 50);
  const pageSize = Math.max(10, Number(arg("--size") ?? 50) || 50);
  const only = (arg("--only") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const dataFinal = pncpDay(new Date());

  console.log(`PNCP 取数 — dataFinal=${dataFinal}，每条最多等 ${Math.round(timeoutMs / 1000)}s`);
  console.log("查询形状固定为探针里唯一通过的那条：不带 uf，不带 dataInicial。这两个参数都会让服务端 500。\n");

  // ── 对照组 ───────────────────────────────────────────────────────────────
  console.log("【对照组】modalidades —— 已知可用。这条挂了，下面全部作废。");
  const control = await get(MODALIDADES_URL, timeoutMs);
  if (!control.ok || !Array.isArray(control.body)) {
    console.log(`  FAIL  ${control.status}  ${control.ms}ms  ${control.note}`);
    console.log("\n对照组失败 —— 这台机器连 PNCP 已知可用的端点都读不到。先解决网络，再跑一次。");
    return;
  }
  const modalidades = (control.body as { id: number; nome: string }[])
    .map((m) => ({ id: Number(m.id), nome: String(m.nome ?? "") }))
    .sort((a, b) => a.id - b.id);
  console.log(`  OK    200  ${control.ms}ms  ${modalidades.length} 种采购方式\n`);
  for (const m of modalidades) console.log(`    ${String(m.id).padStart(3)}  ${m.nome}`);
  console.log();

  const targets = only.length > 0 ? modalidades.filter((m) => only.includes(m.id)) : modalidades;
  if (only.length > 0) {
    const missing = only.filter((id) => !modalidades.some((m) => m.id === id));
    if (missing.length > 0) console.log(`  （--only 里的 ${missing.join(", ")} 不在 PNCP 的采购方式表里，已忽略）\n`);
  }

  // ── 逐个采购方式数数 ─────────────────────────────────────────────────────
  //
  // The point of sweeping ALL of them: the matrix only ever tried mod=4
  // alongside `uf`, so Concorrência Eletrônica — where the large public works
  // live — has never been tried in the shape that works. A count is also the
  // cheapest possible question (page 1, read totalRegistros, discard the rows).
  console.log(`【1】每种采购方式当前开放收标的数量 —— ${targets.length} 次请求，按上次的 63s 算，预计 ${Math.ceil((targets.length * 63) / 60)} 分钟左右。`);
  if (only.length === 0) console.log("     只想快速看两种的话：npm run dump:brazil-pncp -- --only 6,4\n");
  else console.log();

  type Count = { id: number; nome: string; ok: boolean; status: number | string; ms: number; total: number | null; note: string };
  const counts: Count[] = [];
  // Three hard failures in a row is the service being down, not three
  // unlucky modalities — and each of those three already cost its own
  // retries. Walking the remaining sixteen just to collect sixteen more
  // copies of the same 503 wastes twenty minutes and teaches nothing.
  let consecutiveFailures = 0;
  let abandoned = 0;
  for (const [index, m] of targets.entries()) {
    const { page, result } = await fetchPage(m.id, dataFinal, 1, 10, timeoutMs);
    const total = page?.totalRegistros ?? null;
    counts.push({ id: m.id, nome: m.nome, ok: result.ok, status: result.status, ms: result.ms, total, note: result.note });
    console.log(
      `  ${result.ok ? "OK  " : "FAIL"}  ${String(result.status).padEnd(12)} ${String(result.ms).padStart(7)}ms  ${String(m.id).padStart(3)} ${m.nome}` +
        (result.ok ? `  →  ${total ?? "?"} 条` : `  ${result.note}`),
    );
    consecutiveFailures = result.ok ? 0 : consecutiveFailures + 1;
    if (consecutiveFailures >= 3) {
      abandoned = targets.length - index - 1;
      if (abandoned > 0) console.log(`\n  连续 3 次都没通（每次都已经重试过）。剩下 ${abandoned} 种不试了 —— 是服务不可用，不是这几种采购方式的问题。`);
      break;
    }
  }
  console.log();

  const answered = counts.filter((c) => c.ok && (c.total ?? 0) > 0).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  if (answered.length === 0) {
    // These two look identical in a "0 rows" summary and mean opposite
    // things: one is a fact about Brazil's procurement calendar, the other
    // is a fact about PNCP's uptime. Never report them as the same outcome.
    const replied = counts.filter((c) => c.ok);
    if (replied.length === 0) {
      const statuses = [...new Set(counts.map((c) => String(c.status)))].join(", ");
      console.log(`一条都没答上来（${statuses}）。/modalidades 在同一次运行里 ${control.ms}ms 就回了，所以域名是通的、这台机器也没问题 —— 是 /api/consulta 这个服务本身下线了。`);
      console.log("跟查询形状无关，也不是「今天没项目」。过几个小时或者隔天再跑一次。");
    } else {
      console.log(`${replied.length} 种采购方式正常返回了，但开放收标的都是 0 条。这是巴西今天确实没有在收标的项目，不是 PNCP 坏了 —— 隔天再跑一次确认。`);
    }
    return;
  }

  // ── 原始行 ───────────────────────────────────────────────────────────────
  //
  // Whole JSON, not a field list. orgaoEntidade / unidadeOrgao are nested and
  // nobody here has seen inside them; buyer name, UF, municipality and the
  // federal/state/municipal split all have to come from in there.
  const richest = answered[0];
  console.log(`【2】原始行全文（${richest.id} ${richest.nome}，共 ${richest.total} 条）—— mapper 按这个写，不按 Swagger 截图写。\n`);
  const { page: firstPage, size: usedSize } = await fetchPage(richest.id, dataFinal, 1, pageSize, timeoutMs);
  const firstRow = firstPage?.data?.[0] as Record<string, unknown> | undefined;
  if (!firstRow) {
    console.log("  这一页是空的 —— 上面数出来有数据，翻页却拿不到。把这行贴给我。");
    return;
  }
  console.log(JSON.stringify(firstRow, null, 2).split("\n").map((line) => `  ${line}`).join("\n"));
  console.log();
  if (usedSize !== pageSize) console.log(`  （每页实际用的是 ${usedSize} 条，不是 ${pageSize}）\n`);

  // ── 葡语标题 ─────────────────────────────────────────────────────────────
  console.log(`【3】抓 ${wantTitles} 条真实葡语标题 —— 葡语规则要的就是这个。\n`);
  const collected: Record<string, unknown>[] = [];
  outer: for (const modality of answered) {
    for (let pagina = 1; ; pagina += 1) {
      const { page } = await fetchPage(modality.id, dataFinal, pagina, pageSize, timeoutMs);
      const rows = (page?.data ?? []) as Record<string, unknown>[];
      for (const row of rows) {
        collected.push({ ...row, __modalidade: `${modality.id} ${modality.nome}` });
        if (collected.length >= wantTitles) break outer;
      }
      if (rows.length === 0 || (page?.totalPaginas !== undefined && pagina >= page.totalPaginas)) break;
    }
  }

  for (const [i, row] of collected.entries()) {
    const value = pick(row, "valorTotalEstimado");
    console.log(`  ${String(i + 1).padStart(3)}. ${pick(row, "objetoCompra").replace(/\s+/g, " ").slice(0, 150)}`);
    console.log(`       ${pick(row, "__modalidade")} | R$ ${value || "—"} | 收标至 ${pick(row, "dataEncerramentoProposta") || "—"}`);
  }
  console.log();

  // Columns are raw PNCP paths on purpose. No mapper exists yet, so anything
  // this file calls `buyer` or `deadline` would be this script guessing —
  // and the guess is exactly what the next round is supposed to settle.
  const columns = [
    "numeroControlePNCP",
    "__modalidade",
    "modalidadeNome",
    "objetoCompra",
    "informacaoComplementar",
    "valorTotalEstimado",
    "valorTotalHomologado",
    "dataAberturaProposta",
    "dataEncerramentoProposta",
    "dataPublicacaoPncp",
    "situacaoCompraNome",
    "srp",
    "orgaoEntidade.razaoSocial",
    "orgaoEntidade.cnpj",
    "orgaoEntidade.esferaId",
    "orgaoEntidade.poderId",
    "unidadeOrgao.nomeUnidade",
    "unidadeOrgao.ufSigla",
    "unidadeOrgao.municipioNome",
    "linkSistemaOrigem",
    "processo",
  ];
  const csvRows: CsvValue[][] = collected.map((row) => columns.map((c) => pick(row, c)));
  const path = writeReviewCsv({
    dir: OUT_DIR,
    baseName: `brazil-pncp-titles-${new Date().toISOString().slice(0, 10)}`,
    csv: toCsv(columns, csvRows),
    label: "dump-brazil-pncp",
    failureNote: "上面已经打印出来了，没丢",
  });
  if (path) console.log(`已写入 ${collected.length} 行 → ${path}\n`);

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const c of counts) {
    console.log(`  ${(c.ok ? "OK  " : "FAIL").padEnd(5)} ${String(c.status).padEnd(12)} ${String(c.ms).padStart(7)}ms  ${String(c.id).padStart(3)} ${c.nome}  ${c.ok ? `${c.total ?? "?"} 条` : c.note}`);
  }
  console.log();
  console.log("把【2】的原始行全文和上面那个 CSV 发我：");
  console.log("  · 原始行 → connector 和 mapper 照着真实字段写（嵌套对象里才有采购单位、州、市和政府层级）");
  console.log("  · CSV 里的 objetoCompra → 葡语排除/分级规则，规则必须在第一次导入之前落地");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
