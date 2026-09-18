/**
 * Which /api/search parameters actually narrow anything?
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * `dump:brazil-search` (2026-09-18) found that `status` is simultaneously
 * MANDATORY (omit it and the request is refused, "O filtro status é
 * obrigatório") and INERT — three mutually exclusive states each returned
 * ~4,081,73X rows, the whole index. The index holds ~4.08 million documents
 * and this platform wants a few hundred, so whether anything narrows
 * server-side decides whether a Brazil connector is an import or a crawl.
 *
 * The method is: do not ask whether a parameter is ACCEPTED, ask whether it
 * FILTERS. An ignored parameter returns 200 and looks exactly like a working
 * one; only the total gives it away.
 *
 * ── FIRST RUN (2026-09-18) — the controls failed, correctly ───────────────
 *
 * The run reported `uf=SP` as "✅ 有效 —— 4,081,820 条（基准的 100.0%）",
 * which is self-contradictory on its face, and the control check refused the
 * whole report rather than let those lines be read as findings. Three
 * separate faults, all in this file, all now fixed:
 *
 *   1. **The index is written to continuously.** Totals drifted by dozens
 *      between consecutive requests, and the fake parameter came back HIGHER
 *      than the baseline (4,081,830 vs 4,081,821). A bare `total < baseline`
 *      test therefore called ordinary drift "filtering", and the negative
 *      control's exact-equality test could never pass. The baseline is now
 *      sampled repeatedly to MEASURE the drift, and a parameter counts as
 *      filtering only if it removes far more than the drift band.
 *   2. **`q` and `status` are mutually exclusive.** `q=obra` answered fine in
 *      probe:brazil-alt and came back ECONNRESET here — the difference being
 *      that here it was sent alongside `status`. So there is no single
 *      baseline: this now measures against BOTH a `q` baseline and a `status`
 *      baseline, and a parameter is judged separately under each.
 *   3. ~~A reset means the server KNOWS the parameter.~~ **Retracted after
 *      the second run — a reset means almost nothing.** The theory was that
 *      unknown names were ignored while real ones were rejected. The second
 *      run killed it: `tipos_documento=ata`, which had answered 200 in
 *      292ms, came back reset, and so did `zzz_nao_existe` — a parameter
 *      invented for this file. Meanwhile `ufs`, `esferas`, `modalidades` and
 *      `orgaos`, all "rejected" in run one, all answered and filtered
 *      properly in run two. An entire earlier invocation had also failed at
 *      both baselines and then succeeded on a retry a moment later.
 *      **`ECONNRESET` on this endpoint is intermittent — a connection-level
 *      throttle, not a verdict on the request.** So it must be RETRIED, not
 *      recorded. Anything else turns PNCP's rate limiting into fabricated
 *      findings about our parameters, which is exactly what run one did.
 *
 * ── SECOND RUN (2026-09-18) — what actually filters ───────────────────────
 *
 *   ufs=SP              819,310   20.1%
 *   esferas=M         2,795,508   68.5%
 *   modalidades=4       143,719    3.5%   ← Concorrência Eletrônica
 *   orgaos=40314            383    0.0%
 *
 * `modalidades` is the one that makes a Brazil connector viable: bare numeric
 * id, and it takes 4.08 million documents down to 143 thousand. Combined with
 * a date bound it is an import rather than a crawl.
 *
 * `tipos_documento` filters too (`edital` → 4.08M, `ata` → 1,170,148 = 28.7%,
 * measured in run one) and remains the positive control.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-search-filters
 *   npm run probe:brazil-search-filters -- --pace 2000
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const SEARCH = "https://pncp.gov.br/api/search";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Shared by both baselines. Exactly one of `q` / `status` is added on top — they cannot be sent together. */
const COMMON: Params = { tipos_documento: "edital", ordenacao: "-data", pagina: "1", tam_pagina: "10" };

type Measured = { total: number | null; rows: number; status: number | string; ms: number; note: string; rejected: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Params = Record<string, string | string[]>;

/** A value may be an array, which becomes a repeated key — the other way a multi-select filter is usually spelled. */
function toQuery(params: Params): string {
  return Object.entries(params)
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((one) => `${k}=${encodeURIComponent(one)}`) : [`${k}=${encodeURIComponent(v)}`]))
    .join("&");
}

async function countOnce(params: Params, timeoutMs: number): Promise<Measured> {
  const query = toQuery(params);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SEARCH}?${query}`, { headers: HEADERS, signal: controller.signal });
    const ms = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { total: null, rows: 0, status: response.status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140), rejected: true };
    }
    const body = JSON.parse(text) as Record<string, unknown>;
    return {
      total: typeof body.total === "number" ? body.total : null,
      rows: Array.isArray(body.items) ? (body.items as unknown[]).length : 0,
      status: response.status,
      ms,
      note: "",
      rejected: false,
    };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const reset = describeFetchFailure(err).includes("ECONNRESET");
    return {
      total: null,
      rows: 0,
      // A reset from THIS endpoint is a statement about the request, not the
      // network — and specifically it means the server recognised enough of
      // the request to object to it.
      status: message.includes("abort") ? "超时" : reset ? "连接被重置" : "连接失败",
      ms,
      note: reset ? "连接被重置" : describeFetchFailure(err).slice(0, 160),
      rejected: reset,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry a reset instead of recording it.
 *
 * Run two proved ECONNRESET here is intermittent: `tipos_documento=ata`
 * answered 200 in one run and reset in the next, an invented parameter reset
 * too, and four parameters "rejected" in run one filtered perfectly in run
 * two. Treating a reset as a verdict turns PNCP's connection throttle into
 * fabricated findings about our own parameters — which is precisely what run
 * one published. Only a value that resets on every attempt, several seconds
 * apart, has said anything about itself.
 */
const RESET_BACKOFF_MS = [2_000, 5_000, 12_000];

async function count(params: Params, timeoutMs: number): Promise<Measured & { attempts: number }> {
  let last = await countOnce(params, timeoutMs);
  for (const [index, wait] of RESET_BACKOFF_MS.entries()) {
    if (!last.rejected) return { ...last, attempts: index + 1 };
    await sleep(wait);
    last = await countOnce(params, timeoutMs);
  }
  return { ...last, attempts: RESET_BACKOFF_MS.length + 1 };
}

/**
 * How much the total moves on its own.
 *
 * PNCP indexes continuously, so two identical requests a second apart return
 * different totals. Without this number every comparison below is noise
 * dressed as a finding — which is exactly what the first run produced.
 */
async function measureDrift(base: Params, timeoutMs: number, paceMs: number): Promise<{ total: number; drift: number } | null> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) await sleep(paceMs);
    const measured = await count(base, timeoutMs);
    if (measured.total === null) return null;
    samples.push(measured.total);
  }
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  console.log(`    三次同样的请求：${samples.join(" / ")}   自然漂移 ${max - min} 条`);
  return { total: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length), drift: max - min };
}

type Verdict = "有效" | "被忽略" | "写法无效" | "被拒" | "读不到";

/**
 * Narrowing and matching nothing are not the same outcome.
 *
 * Run three reported `modalidades=4,6`, `4;6` and `[4,6]` as "✅ 有效" because
 * each returned fewer rows than the baseline — all three returned ZERO. A
 * comma-separated list taken as one literal string matches no modality at
 * all, which is a rejected encoding wearing a filter's clothes, and the most
 * expensive kind of wrong here: a connector built on it would query happily,
 * import nothing, and report success. Zero is its own verdict.
 */
function judge(measured: Measured, baseline: number, threshold: number): { verdict: Verdict; detail: string } {
  if (measured.rejected) return { verdict: "被拒", detail: "重试 4 次全部被重置 —— 这才算这个写法真的不被接受" };
  if (measured.total === null) return { verdict: "读不到", detail: `${measured.status} ${measured.note}` };
  if (measured.total === 0) return { verdict: "写法无效", detail: "0 条 —— 服务器收下了，但一条都没匹配上。这不是过滤，是这个写法它读不懂" };
  const removed = baseline - measured.total;
  if (removed <= threshold) return { verdict: "被忽略", detail: `${measured.total} 条（跟基准差 ${removed} 条，在漂移范围内）` };
  return { verdict: "有效", detail: `${measured.total} 条 —— 基准的 ${((measured.total / baseline) * 100).toFixed(1)}%` };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 60) || 60) * 1000;
  const paceMs = Math.max(0, Number(arg("--pace") ?? 2500) || 2500);

  console.log("PNCP /api/search — 哪些参数是真的在过滤\n");
  console.log("被忽略的参数一样返回 200，长得和生效的一模一样 —— 只有总数会露馅。");
  console.log("但这个索引一直在写入，两次一样的请求总数就不同，所以先量「自然漂移」，再拿它当噪声底线。\n");

  const baselines: { name: string; extra: Params }[] = [
    { name: "status 基准（不带 q）", extra: { status: "em_recebimento_de_proposta" } },
    { name: "q 基准（不带 status）", extra: { q: "obra" } },
  ];

  const measuredBaselines: { name: string; params: Params; total: number; threshold: number }[] = [];
  for (const [index, baseline] of baselines.entries()) {
    if (index > 0) await sleep(paceMs);
    console.log(`  ${baseline.name}`);
    const drift = await measureDrift({ ...COMMON, ...baseline.extra }, timeoutMs, paceMs);
    if (drift === null) {
      console.log("    这条基准没量到 —— 它下面的判断全部跳过。\n");
      continue;
    }
    // Ten times the observed drift, floored at 0.5% of the index. A real
    // filter on four million documents removes percentages, not dozens; this
    // band is deliberately generous so nothing marginal gets called a finding.
    const threshold = Math.max(drift.drift * 10, Math.round(drift.total * 0.005));
    console.log(`    基准 ${drift.total} 条，判定门槛：要比基准少 ${threshold} 条以上才算「有效」\n`);
    measuredBaselines.push({ name: baseline.name, params: { ...COMMON, ...baseline.extra }, total: drift.total, threshold });
  }
  if (measuredBaselines.length === 0) {
    console.log("两条基准都没量到。先修这个，其他都没意义。");
    return;
  }

  // Candidate names come from the PNCP site's own filter UI and third-party
  // collectors. The plural spellings are tried in several encodings because
  // the first run's resets say the server knows those names and objected to
  // the values, not to the names.
  // Run two already established that ufs / esferas / modalidades / orgaos all
  // filter with a bare value. What is still unknown, and is what decides the
  // connector's request count, is whether they take MORE THAN ONE value and
  // whether a date bound exists at all — so those are what this list spends
  // its requests on now.
  const candidates: { label: string; extra: Params; role?: "正对照" | "负对照" }[] = [
    { label: "tipos_documento=ata", extra: { tipos_documento: "ata" }, role: "正对照" },
    { label: "zzz_nao_existe=1（假参数）", extra: { zzz_nao_existe: "1" }, role: "负对照" },

    // Known to work with one value — re-measured as the anchors everything
    // below is compared against.
    { label: "modalidades=4（已知有效）", extra: { modalidades: "4" } },
    // 6 alone is what makes the repeated-key result readable at all. Run
    // three measured `4` and `4&6` but never `6`, and both OR and
    // last-wins fit those two numbers — see the disambiguation below.
    { label: "modalidades=6（单独，用来对照）", extra: { modalidades: "6" } },
    { label: "ufs=SP（已知有效）", extra: { ufs: "SP" } },
    { label: "esferas=M（已知有效）", extra: { esferas: "M" } },

    // Multi-value spellings. If one works, the whole of Concorrência +
    // Pregão comes back in a single query instead of two passes.
    { label: "modalidades=4&modalidades=6（重复键）", extra: { modalidades: ["4", "6"] } },
    { label: "modalidades=4,6（逗号）", extra: { modalidades: "4,6" } },
    { label: "modalidades=4;6（分号）", extra: { modalidades: "4;6" } },
    { label: "modalidades=[4,6]（JSON 数组）", extra: { modalidades: "[4,6]" } },
    { label: "modalidades[]=4&modalidades[]=6", extra: { "modalidades[]": ["4", "6"] } },

    // A date bound is what turns a full sweep into a daily increment. Nothing
    // documents its name, and the two tried in run two were silently ignored.
    { label: "dataPublicacaoPncpInicial=2026-09-17", extra: { dataPublicacaoPncpInicial: "2026-09-17" } },
    { label: "data_publicacao_pncp_inicial=2026-09-17", extra: { data_publicacao_pncp_inicial: "2026-09-17" } },
    { label: "dataInicial=2026-09-17", extra: { dataInicial: "2026-09-17" } },
    { label: "data_inicio=2026-09-17", extra: { data_inicio: "2026-09-17" } },
    { label: "periodo_inicial=2026-09-17", extra: { periodo_inicial: "2026-09-17" } },

    // The combination the connector would actually send.
    { label: "modalidades=4 + ufs=SP（组合）", extra: { modalidades: "4", ufs: "SP" } },
  ];

  const table: { label: string; role?: string; cells: { verdict: Verdict; detail: string; ms: number }[] }[] = [];
  for (const candidate of candidates) {
    const cells: { verdict: Verdict; detail: string; ms: number }[] = [];
    for (const baseline of measuredBaselines) {
      await sleep(paceMs);
      const measured = await count({ ...baseline.params, ...candidate.extra }, timeoutMs);
      const judged = judge(measured, baseline.total, baseline.threshold);
      cells.push({ ...judged, ms: measured.ms, ...(measured.attempts > 1 ? { detail: `${judged.detail}（重试了 ${measured.attempts - 1} 次）` } : {}) });
    }
    table.push({ label: candidate.label, ...(candidate.role ? { role: candidate.role } : {}), cells });
    const rendered = cells.map((c, i) => `${measuredBaselines[i].name.split("（")[0]}: ${c.verdict}`).join("   |   ");
    console.log(`  ${(candidate.role ?? "").padEnd(4)} ${candidate.label.padEnd(38)} ${rendered}`);
    for (const [i, cell] of cells.entries()) {
      if (cell.verdict === "有效" || cell.verdict === "被拒") console.log(`         └ ${measuredBaselines[i].name}：${cell.detail}`);
    }
  }

  console.log("\n" + "─".repeat(72));
  const row = (needle: string) => table.find((t) => t.label.startsWith(needle));
  const positive = row("tipos_documento=ata");
  const negative = row("zzz_nao_existe");
  const controlsOk = positive?.cells.some((c) => c.verdict === "有效") === true && negative?.cells.every((c) => c.verdict === "被忽略") === true;

  if (!controlsOk) {
    console.log("对照组不成立 —— 正对照（tipos_documento）没缩小，或者假参数反而被判成有效。");
    console.log("测量方法本身有问题，上面每一行都不能当结论。把整段发我。");
    return;
  }
  console.log("对照组通过：tipos_documento 会缩小结果，假参数不会。下面的判断可信。\n");

  const effective = table.filter((t) => !t.role && t.cells.some((c) => c.verdict === "有效"));
  const rejected = table.filter((t) => !t.role && t.cells.every((c) => c.verdict === "被拒"));
  const ignored = table.filter((t) => !t.role && t.cells.every((c) => c.verdict === "被忽略"));

  console.log(`真的能缩小结果的：${effective.length === 0 ? "一个都没有" : effective.map((t) => t.label).join("，")}`);
  console.log(`重试 4 次仍然被重置的（这才算这个写法真的不被接受）：${rejected.length === 0 ? "无" : rejected.map((t) => t.label).join("，")}`);
  console.log(`收下但完全不起作用的：${ignored.length === 0 ? "无" : ignored.map((t) => t.label).join("，")}`);
  console.log();
  const multi = table.filter((t) => t.label.includes("重复键") || t.label.includes("逗号") || t.label.includes("分号") || t.label.includes("JSON"));
  const multiWorks = multi.filter((t) => t.cells.some((c) => c.verdict === "有效"));
  const dates = table.filter((t) => /data|periodo/i.test(t.label));
  const dateWorks = dates.filter((t) => t.cells.some((c) => c.verdict === "有效"));

  // A repeated key that returns more rows than either value alone is a union.
  // One that returns exactly what the LAST value returns alone is the server
  // overwriting the first — which looks like success and silently drops half
  // the query. Only the third number tells them apart.
  const totalOf = (needle: string, cell: number) => {
    const found = table.find((t) => t.label.startsWith(needle))?.cells[cell];
    const match = found?.detail.match(/^([\d]+) 条/);
    return match ? Number(match[1]) : null;
  };
  console.log("\nmodalidades 传两个值时到底怎么解释的：");
  for (const [index, baseline] of measuredBaselines.entries()) {
    const only4 = totalOf("modalidades=4（已知有效）", index);
    const only6 = totalOf("modalidades=6", index);
    const both = totalOf("modalidades=4&modalidades=6", index);
    if (only4 === null || only6 === null || both === null) {
      console.log(`  ${baseline.name}：三个数没凑齐，判断不了`);
      continue;
    }
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(baseline.threshold, Math.round(b * 0.02));
    const reading = near(both, only4 + only6)
      ? "并集（OR）—— 可以一次把两种采购方式都拉回来 ✅"
      : near(both, only6)
        ? "只认最后一个值 —— 前面那个被悄悄丢了 ⚠️ 必须分开发请求"
        : near(both, only4)
          ? "只认第一个值 —— 后面那个被悄悄丢了 ⚠️ 必须分开发请求"
          : "三个数对不上任何一种解释 —— 把这一行发我";
    console.log(`  ${baseline.name}：4 单独 ${only4}，6 单独 ${only6}，两个一起 ${both}  →  ${reading}`);
  }
  console.log();
  console.log(`modalidades 能不能一次传多个：${multiWorks.length === 0 ? "不能 —— 每种采购方式得单独发一轮" : `写法上能用的：${multiWorks.map((t) => t.label).join("，")}（语义看上面那几行）`}`);
  console.log(`有没有日期下界：${dateWorks.length === 0 ? "没找到 —— 每天得整轮扫一遍，靠 data_atualizacao_pncp 自己判断哪些是新的" : `有：${dateWorks.map((t) => t.label).join("，")}`}`);
  console.log();
  if (effective.length === 0) {
    console.log("除了 tipos_documento 和 q，没有任何服务端过滤器 —— 那 connector 只能靠关键词收窄。");
  } else {
    console.log("把这张表发我 —— 能生效的那几个直接决定 connector 每天要发多少次请求。");
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
