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
 *   3. **A reset means the server KNOWS the parameter.** Unknown names
 *      (`zzz_nao_existe`, `modalidade`, `data_publicacao_inicial`) were
 *      silently ignored and returned 200. The plural names — `ufs`,
 *      `esferas`, `modalidades`, `municipios`, `orgaos` — were reset. A
 *      service does not reject a name it has never heard of while ignoring
 *      others, so those five are almost certainly the REAL filter names and
 *      the value format is what they refused. They get several encodings
 *      tried here rather than one.
 *
 * The one parameter proven to filter so far is `tipos_documento`
 * (`edital` → 4.08M, `ata` → 1,170,148 = 28.7%), which is why it serves as
 * the positive control below.
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
const COMMON: Record<string, string> = { tipos_documento: "edital", ordenacao: "-data", pagina: "1", tam_pagina: "10" };

type Measured = { total: number | null; rows: number; status: number | string; ms: number; note: string; rejected: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function count(params: Record<string, string>, timeoutMs: number): Promise<Measured> {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
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
      status: message.includes("abort") ? "超时" : reset ? "被拒(RST)" : "连接失败",
      ms,
      note: reset ? "服务器认识这个参数，但不接受这个写法/组合" : describeFetchFailure(err).slice(0, 160),
      rejected: reset,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How much the total moves on its own.
 *
 * PNCP indexes continuously, so two identical requests a second apart return
 * different totals. Without this number every comparison below is noise
 * dressed as a finding — which is exactly what the first run produced.
 */
async function measureDrift(base: Record<string, string>, timeoutMs: number, paceMs: number): Promise<{ total: number; drift: number } | null> {
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

type Verdict = "有效" | "被忽略" | "被拒" | "读不到";

function judge(measured: Measured, baseline: number, threshold: number): { verdict: Verdict; detail: string } {
  if (measured.rejected) return { verdict: "被拒", detail: measured.note };
  if (measured.total === null) return { verdict: "读不到", detail: `${measured.status} ${measured.note}` };
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
  const paceMs = Math.max(0, Number(arg("--pace") ?? 1200) || 1200);

  console.log("PNCP /api/search — 哪些参数是真的在过滤\n");
  console.log("被忽略的参数一样返回 200，长得和生效的一模一样 —— 只有总数会露馅。");
  console.log("但这个索引一直在写入，两次一样的请求总数就不同，所以先量「自然漂移」，再拿它当噪声底线。\n");

  const baselines: { name: string; extra: Record<string, string> }[] = [
    { name: "status 基准（不带 q）", extra: { status: "em_recebimento_de_proposta" } },
    { name: "q 基准（不带 status）", extra: { q: "obra" } },
  ];

  const measuredBaselines: { name: string; params: Record<string, string>; total: number; threshold: number }[] = [];
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
  const candidates: { label: string; extra: Record<string, string>; role?: "正对照" | "负对照" }[] = [
    { label: "tipos_documento=ata", extra: { tipos_documento: "ata" }, role: "正对照" },
    { label: "zzz_nao_existe=1（假参数）", extra: { zzz_nao_existe: "1" }, role: "负对照" },
    { label: "ufs=SP", extra: { ufs: "SP" } },
    { label: "ufs=SP|RJ（竖线分隔）", extra: { ufs: "SP|RJ" } },
    { label: "ufs=35（IBGE 州代码）", extra: { ufs: "35" } },
    { label: "esferas=M", extra: { esferas: "M" } },
    { label: "esferas=Municipal", extra: { esferas: "Municipal" } },
    { label: "modalidades=4", extra: { modalidades: "4" } },
    { label: "modalidades=4|6", extra: { modalidades: "4|6" } },
    { label: "modalidades=Concorrência - Eletrônica", extra: { modalidades: "Concorrência - Eletrônica" } },
    { label: "municipios=4464（PNCP 内部 id）", extra: { municipios: "4464" } },
    { label: "municipios=3550308（IBGE 码）", extra: { municipios: "3550308" } },
    { label: "orgaos=40314", extra: { orgaos: "40314" } },
    { label: "dataPublicacaoInicial=2026-09-17", extra: { dataPublicacaoInicial: "2026-09-17" } },
    { label: "data_inicial=2026-09-17", extra: { data_inicial: "2026-09-17" } },
  ];

  const table: { label: string; role?: string; cells: { verdict: Verdict; detail: string; ms: number }[] }[] = [];
  for (const candidate of candidates) {
    const cells: { verdict: Verdict; detail: string; ms: number }[] = [];
    for (const baseline of measuredBaselines) {
      await sleep(paceMs);
      const measured = await count({ ...baseline.params, ...candidate.extra }, timeoutMs);
      cells.push({ ...judge(measured, baseline.total, baseline.threshold), ms: measured.ms });
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
  console.log(`被服务器直接拒掉的（说明它认识这个名字，只是不接受这个写法）：${rejected.length === 0 ? "无" : rejected.map((t) => t.label).join("，")}`);
  console.log(`收下但完全不起作用的：${ignored.length === 0 ? "无" : ignored.map((t) => t.label).join("，")}`);
  console.log();
  if (effective.length === 0) {
    console.log("除了 tipos_documento 和 q，没有任何服务端过滤器 —— 那 connector 只能靠关键词收窄。");
    console.log("下一步要定的是用哪几个葡语词，以及漏掉的项目能不能接受。");
  } else {
    console.log("把这张表发我 —— 能生效的那几个直接决定 connector 每天要发多少次请求。");
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
