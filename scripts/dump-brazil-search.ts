/**
 * PNCP's search index answered. Find out exactly what it will give us.
 *
 * `probe:brazil-alt` on 2026-09-18 settled the architecture question:
 *
 *   A1/A2  /api/search    200    2,372ms / 949ms    205,272 条
 *   A4     /api/consulta  502   45,705ms
 *
 * Same host, same run. `/api/consulta` — the relational database with the
 * Hikari pool — was failing for the fourth distinct reason in two days, while
 * the search path answered in under a second. The returned row says why they
 * are independent: `"index": "catalog2"`, `"doc_type": "_doc"`. That is
 * Elasticsearch. So `/api/search` is not a second view of the same database,
 * it is a different system, and it is the one that is up.
 *
 * It is also close to a full record, which was the open question. One row
 * carries orgao_nome / unidade_nome (buyer), esfera_nome ("Municipal" — the
 * government level), municipio_nome + uf, modalidade_licitacao_nome,
 * situacao_nome, numero_controle_pncp, item_url, data_publicacao_pncp, and a
 * `description` holding the entire object text in Portuguese. Against
 * /api/consulta it is missing only two things that matter, and this script
 * exists to measure both rather than assume either:
 *
 *   1. `valor_global` was null on the one row we have seen. Null on one
 *      revoked edital proves nothing about live ones. If it is null in
 *      general, the money has to come from /api/consulta or the detail page
 *      and this becomes a discovery endpoint rather than a replacement.
 *   2. There is no `dataEncerramentoProposta`. There IS
 *      `data_inicio_vigencia` / `data_fim_vigencia`, which on that row read
 *      2026-03-11 17:00 → 2026-03-30 08:00 — exactly the shape of a proposal
 *      window. Plausible is not confirmed; the coverage report below is what
 *      decides it.
 *
 * Two traps found in that single row, both of which would have shipped
 * silently:
 *
 *   - `situacao_nome` was **"Revogada"**. The index holds revoked and expired
 *     notices, not just live ones, so an import that just reads pages would
 *     fill the feed with dead tenders. `status` is the filter for that, and
 *     A5 proved it is MANDATORY when `q` is absent ("O filtro status é
 *     obrigatório"). Its accepted values are not documented anywhere we
 *     found, so step 1 measures them instead of guessing.
 *   - `ordenacao=-data` returned a notice **published 2026-03-11** as the
 *     first result — but its `data_atualizacao_pncp` was today. So "-data"
 *     sorts by UPDATE time, not publication. An incremental import keyed on
 *     that would re-pull old tenders forever and, worse, could mistake a
 *     touched old record for a new one. Step 3 prints both dates for the
 *     first rows so the ordering is read off real data.
 *
 * Deliverables, same two as dump:brazil-pncp: the real shape a mapper gets
 * written against, and 30–50 real Portuguese titles for the ruleset that must
 * land before the first import (an excluded tender is never stored, so a
 * wrong Portuguese rule means manual cleanup).
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run dump:brazil-search
 *   npm run dump:brazil-search -- --titles 50 --q "obra"
 */
import { toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";
import { describeFetchFailure } from "@/lib/fetch-failure";

const SEARCH = "https://pncp.gov.br/api/search";
const OUT_DIR = "exports";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

type Row = Record<string, unknown>;
type Fetched = { ok: boolean; status: number | string; ms: number; rows: Row[]; total: number | null; note: string; wrapper?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string, timeoutMs: number): Promise<Fetched> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const ms = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, ms, rows: [], total: null, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) };
    }
    if (response.status === 204 || text.trim() === "") return { ok: true, status: response.status, ms, rows: [], total: 0, note: "空" };
    // The envelope key is NOT assumed. probe:brazil-alt found the rows by
    // trying several names and never reported which one matched, so hard-
    // coding `items` here would be this script inheriting a guess it cannot
    // see — and a wrong guess reads as "the endpoint returned nothing",
    // which is the failure mode this whole Brazil thread keeps hitting.
    const body = JSON.parse(text) as Record<string, unknown>;
    const wrapper = ["items", "data", "resultado", "resultados", "content", "hits"].find((key) => Array.isArray(body[key]));
    const rows = wrapper ? (body[wrapper] as Row[]) : [];
    const total = ["total", "totalRegistros", "totalElements", "total_registros"].map((k) => body[k]).find((v) => typeof v === "number") as number | undefined;
    return {
      ok: true,
      status: response.status,
      ms,
      rows,
      total: total ?? null,
      note: wrapper ? "" : `没认出行在哪：外层键 ${Object.keys(body).join(", ")}`,
      ...(wrapper ? { wrapper } : {}),
    };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败",
      ms,
      rows: [],
      total: null,
      note: describeFetchFailure(err).slice(0, 220),
    };
  } finally {
    clearTimeout(timer);
  }
}

function url(params: Record<string, string | number | undefined>): string {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${SEARCH}?${query}`;
}

function value(row: Row, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** The columns are raw snake_case index field names on purpose — no mapper exists yet, so anything this file called `deadline` would be a guess. */
const COLUMNS = [
  "numero_controle_pncp",
  "title",
  "description",
  "modalidade_licitacao_nome",
  "situacao_nome",
  "valor_global",
  "data_publicacao_pncp",
  "data_atualizacao_pncp",
  "data_inicio_vigencia",
  "data_fim_vigencia",
  "orgao_nome",
  "unidade_nome",
  "esfera_nome",
  "poder_nome",
  "municipio_nome",
  "uf",
  "cancelado",
  "tem_resultado",
  "item_url",
];

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 60) || 60) * 1000;
  const wantTitles = Math.max(1, Number(arg("--titles") ?? 50) || 50);
  const paceMs = Math.max(0, Number(arg("--pace") ?? 1200) || 1200);
  const q = arg("--q");

  console.log(`PNCP /api/search 取数 — 每条最多等 ${Math.round(timeoutMs / 1000)}s，间隔 ${paceMs}ms\n`);

  // ── 1. status 到底收哪些值 ────────────────────────────────────────────────
  //
  // A5 got "O filtro status é obrigatório" and nothing we could find documents
  // the accepted values. Asking the server is cheaper and more reliable than
  // reading another blog post: a wrong value answers 400 with its own message,
  // a right one answers 200 with a count.
  console.log("【1】status 收哪些值 —— 这个过滤器是必填的，但没有任何文档写它的取值。直接问服务器。\n");
  const candidates = ["recebendo_proposta", "em_recebimento_de_proposta", "recebendo_propostas", "a_receber_ou_recebendo_proposta", "em_julgamento", "encerradas", "encerrada", "divulgada", "todos"];
  const accepted: { status: string; total: number | null; ms: number; wrapper?: string }[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) await sleep(paceMs);
    const result = await get(url({ tipos_documento: "edital", status: candidate, ordenacao: "-data", pagina: 1, tam_pagina: 10 }), timeoutMs);
    if (result.ok) accepted.push({ status: candidate, total: result.total, ms: result.ms, ...(result.wrapper ? { wrapper: result.wrapper } : {}) });
    console.log(`  ${result.ok ? "OK  " : "FAIL"}  ${String(result.status).padEnd(12)} ${String(result.ms).padStart(6)}ms  status=${candidate.padEnd(32)} ${result.ok ? `${result.total ?? "?"} 条` : result.note.slice(0, 90)}`);
  }
  console.log();
  if (accepted.length === 0) {
    console.log("一个都不收。把上面每条 FAIL 的报错发我 —— 服务器自己会说它想要什么。");
    return;
  }
  // Prefer whichever accepted value describes an OPEN procurement; that is the
  // only set this platform sells. Falling back to the first accepted value
  // keeps the run useful rather than aborting on a naming surprise.
  const open = accepted.find((a) => /receb/.test(a.status)) ?? accepted[0];
  console.log(`能用的：${accepted.map((a) => `${a.status}(${a.total ?? "?"})`).join("，")}`);
  if (accepted[0].wrapper) console.log(`返回的行装在 "${accepted[0].wrapper}" 这个键里 —— connector 照这个写。`);

  // Accepted is not the same as effective, and on 2026-09-18 it was not:
  // three mutually exclusive states each reported ~4,081,73X rows. A state
  // filter that returns the whole index is inert, and the connector has to
  // know that, because it means "open for bidding" must be decided from
  // situacao_nome and the dates on our side.
  const totals = accepted.map((a) => a.total).filter((t): t is number => typeof t === "number");
  if (totals.length > 1) {
    const spread = (Math.max(...totals) - Math.min(...totals)) / Math.max(...totals);
    if (spread < 0.001) {
      console.log("\n  ⚠️  这几个互斥的状态返回的条数几乎一模一样 —— status 是「必填但不过滤」。");
      console.log("      也就是说：不能靠它拿到「正在收标」的集合，得我们自己按 situacao_nome 和日期筛。");
    }
  }
  console.log(`下面用 status=${open.status}。\n`);

  // ── 2. 一页最多能要多少 ───────────────────────────────────────────────────
  console.log("【2】tam_pagina 的上限 —— /api/consulta 最多 50，这边能到多少直接决定要发多少次请求。\n");
  let pageSize = 10;
  for (const size of [500, 100, 50, 10]) {
    await sleep(paceMs);
    const result = await get(url({ tipos_documento: "edital", status: open.status, ordenacao: "-data", pagina: 1, tam_pagina: size }), timeoutMs);
    console.log(`  ${result.ok ? "OK  " : "FAIL"}  ${String(result.status).padEnd(12)} ${String(result.ms).padStart(6)}ms  tam_pagina=${String(size).padEnd(5)} ${result.ok ? `实际返回 ${result.rows.length} 行` : result.note.slice(0, 90)}`);
    if (result.ok && result.rows.length > 0) {
      pageSize = result.rows.length;
      break;
    }
  }
  console.log(`\n  用 ${pageSize} 条一页。\n`);

  // ── 3. 抓行 ──────────────────────────────────────────────────────────────
  console.log(`【3】抓 ${wantTitles} 行${q ? `（关键词 "${q}"）` : "（不带关键词，这才是每日全量导入的形状）"}\n`);
  const collected: Row[] = [];
  for (let pagina = 1; collected.length < wantTitles; pagina += 1) {
    await sleep(paceMs);
    const result = await get(url({ q, tipos_documento: "edital", status: open.status, ordenacao: "-data", pagina, tam_pagina: pageSize }), timeoutMs);
    if (!result.ok) {
      console.log(`  第 ${pagina} 页没取到：${result.status} ${result.note}`);
      break;
    }
    if (result.rows.length === 0) break;
    collected.push(...result.rows);
    console.log(`  第 ${pagina} 页 ${result.rows.length} 行（累计 ${collected.length}）`);
  }
  console.log();
  if (collected.length === 0) {
    console.log("一行都没拿到。把上面的报错发我。");
    return;
  }

  // ── 4. 排序到底按哪个日期 ─────────────────────────────────────────────────
  //
  // The one row seen so far was published in March and sorted first because it
  // had been UPDATED today. If that holds, an incremental import keyed on
  // "-data" re-reads old tenders forever and can mistake a touched record for
  // a new one. Print both dates and let the data say which one drives it.
  console.log("【4】ordenacao=-data 到底按哪个日期排 —— 前 5 行的两个时间戳：\n");
  console.log(`  ${"发布 data_publicacao_pncp".padEnd(32)} ${"更新 data_atualizacao_pncp".padEnd(32)} situacao`);
  for (const row of collected.slice(0, 5)) {
    console.log(`  ${value(row, "data_publicacao_pncp").slice(0, 19).padEnd(32)} ${value(row, "data_atualizacao_pncp").slice(0, 19).padEnd(32)} ${value(row, "situacao_nome")}`);
  }
  const publications = collected.map((r) => value(r, "data_publicacao_pncp")).filter(Boolean);
  const updates = collected.map((r) => value(r, "data_atualizacao_pncp")).filter(Boolean);
  const descending = (list: string[]) => list.every((v, i) => i === 0 || list[i - 1] >= v);
  console.log(`\n  发布时间是否严格倒序：${descending(publications) ? "是" : "否"}    更新时间是否严格倒序：${descending(updates) ? "是" : "否"}`);
  console.log(`  两个都不是倒序 → 这个排序参数不能用来做增量导入；只有更新时间倒序 → 增量得按更新时间走，而且会反复抓到老项目。\n`);

  // ── 5. 字段覆盖率 —— 决定它能不能整个替掉 /api/consulta ────────────────────
  console.log("【5】字段覆盖率 —— 这一步决定 /api/search 是能整个替掉 /api/consulta，还是只能当发现层\n");
  const filled = (key: string) => collected.filter((r) => value(r, key) !== "").length;
  const pct = (n: number) => `${n}/${collected.length}  (${Math.round((n / collected.length) * 100)}%)`;
  for (const key of ["valor_global", "data_inicio_vigencia", "data_fim_vigencia", "data_publicacao_pncp", "orgao_nome", "unidade_nome", "municipio_nome", "uf", "esfera_nome", "modalidade_licitacao_nome", "situacao_nome", "description", "item_url"]) {
    console.log(`  ${key.padEnd(28)} ${pct(filled(key))}`);
  }
  const nowIso = new Date().toISOString();
  const futureEnd = collected.filter((r) => value(r, "data_fim_vigencia") > nowIso).length;
  const withEnd = filled("data_fim_vigencia");
  console.log(`\n  data_fim_vigencia 还在未来的：${pct(futureEnd)}${withEnd > 0 ? `（在有值的 ${withEnd} 条里占 ${Math.round((futureEnd / withEnd) * 100)}%）` : ""}`);
  console.log("  —— 有值的里面绝大多数在未来 → 它就是收标窗口的结束时间，可以当 submissionDeadline；");
  console.log("     过去的那些是 status 不过滤漏进来的（见上面），不是这个字段的问题。\n");

  if (filled("valor_global") === 0) {
    console.log("  ⚠️  valor_global 一条都没有值。金额是这个平台的分级依据（MIN_VALUE_USD / SIGNIFICANT / FLAGSHIP 全靠它），");
    console.log("      所以 /api/search 只能当发现层：金额得回 /api/consulta 或者详情页取。\n");
  }

  const tally = (key: string) => {
    const counts = new Map<string, number>();
    for (const row of collected) counts.set(value(row, key) || "（空）", (counts.get(value(row, key) || "（空）") ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  for (const key of ["situacao_nome", "modalidade_licitacao_nome", "esfera_nome"]) {
    console.log(`  ${key}：${tally(key).map(([k, n]) => `${k} ${n}`).join("，")}`);
  }
  console.log();

  // ── 6. 一行全文 ──────────────────────────────────────────────────────────
  //
  // Deliberately NOT the first row: the one row seen so far was "Revogada",
  // and a mapper written against a revoked notice would be written against
  // the wrong nulls.
  const live = collected.find((r) => value(r, "situacao_nome") !== "Revogada" && value(r, "cancelado") !== "true") ?? collected[0];
  console.log("【6】一行全文（挑的是没被撤销的那种）—— mapper 按这个写\n");
  console.log(JSON.stringify(live, null, 2).split("\n").map((l) => `  ${l}`).join("\n"));
  console.log();

  // ── 7. 葡语标题 ──────────────────────────────────────────────────────────
  console.log("【7】真实葡语标题 —— 葡语规则要的就是这些\n");
  for (const [i, row] of collected.slice(0, wantTitles).entries()) {
    console.log(`  ${String(i + 1).padStart(3)}. ${value(row, "description").replace(/\s+/g, " ").slice(0, 160)}`);
    console.log(`       ${value(row, "modalidade_licitacao_nome")} | ${value(row, "esfera_nome")} | ${value(row, "municipio_nome")}/${value(row, "uf")} | R$ ${value(row, "valor_global") || "—"}`);
  }
  console.log();

  const csv = toCsv(COLUMNS, collected.map((row) => COLUMNS.map((c) => value(row, c)) as CsvValue[]));
  const path = writeReviewCsv({ dir: OUT_DIR, baseName: `brazil-search-${new Date().toISOString().slice(0, 10)}`, csv, label: "dump-brazil-search", failureNote: "上面已经打印出来了，没丢" });
  if (path) console.log(`已写入 ${collected.length} 行 → ${path}\n`);

  console.log("─".repeat(72));
  console.log("把【5】的覆盖率、【4】的排序结论和那个 CSV 发我。三件事就定了：");
  console.log("  · valor_global 有没有值 → 金额能不能直接从这里拿，还是得回 /api/consulta");
  console.log("  · data_fim_vigencia 是不是截止日期 → 决定 submissionDeadline 怎么填");
  console.log("  · description 里的葡语 → 排除和分级规则，必须赶在第一次导入之前落地");
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
