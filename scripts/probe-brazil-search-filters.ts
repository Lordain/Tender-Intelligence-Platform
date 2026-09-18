/**
 * Which /api/search parameters actually narrow anything?
 *
 * `dump:brazil-search` (2026-09-18) produced one result that changes the
 * whole shape of a Brazil connector, and it was not the one being looked for:
 *
 *   status=em_recebimento_de_proposta   4,081,735
 *   status=em_julgamento                4,081,733
 *   status=encerrada                    4,081,733
 *
 * Three mutually exclusive states cannot each hold the entire index. Those
 * are the same number, give or take rows indexed between requests — so
 * **`status` is accepted and then ignored.** It is simultaneously MANDATORY
 * (omit it without `q` and the request is rejected, "O filtro status é
 * obrigatório") and inert. The 100 rows fetched under
 * `em_recebimento_de_proposta` confirm it from the other side: one of them
 * came back `situacao_nome: "Revogada"`, which is not a procurement that is
 * receiving proposals.
 *
 * That matters because the index holds ~4.08 million documents and this
 * platform wants a few hundred. If nothing narrows server-side, a Brazil
 * connector has to page through four million rows at 100 per request to find
 * them, which is not an import, it is a crawl. `q=` is the one filter proven
 * to work (`q=obra` → 205,272, a twentieth of the index), and `q` alone is a
 * blunt instrument: it matches text, not modality or money.
 *
 * So this script asks the only question left: of the parameters the PNCP
 * website's own filter UI exposes, which ones change the count?
 *
 * The method is the one that caught `status`, and it is the point of this
 * file: **do not ask whether a parameter is ACCEPTED, ask whether it
 * FILTERS.** An ignored parameter returns 200 and looks exactly like a
 * working one. Only the total gives it away. Two controls make the report
 * self-checking:
 *
 *   · positive control `q=obra` — known to narrow. If it stops narrowing, the
 *     measurement is broken and nothing else here means anything.
 *   · negative control `status=em_julgamento` — known to be inert. If it
 *     suddenly narrows, PNCP changed something and this file is stale.
 *
 * One more behaviour worth knowing, found the same day: this endpoint answers
 * a bad parameter VALUE by resetting the connection rather than returning
 * 400. `status=todos`, `status=encerradas` and `tam_pagina=500` all came back
 * `ECONNRESET`. So a reset here is a finding about the value, not about the
 * network — which is the opposite of how a reset normally reads, and is why
 * the report below says so rather than printing "连接失败".
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-search-filters
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const SEARCH = "https://pncp.gov.br/api/search";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Everything a request needs before any candidate is added. `status` is mandatory even though it does nothing. */
const BASE_PARAMS: Record<string, string> = { tipos_documento: "edital", status: "em_recebimento_de_proposta", ordenacao: "-data", pagina: "1", tam_pagina: "10" };

type Probe = { label: string; params: Record<string, string>; total: number | null; rows: number; status: number | string; ms: number; note: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function count(params: Record<string, string>, timeoutMs: number): Promise<Omit<Probe, "label" | "params">> {
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
      return { total: null, rows: 0, status: response.status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) };
    }
    const body = JSON.parse(text) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? (body.items as unknown[]) : [];
    const total = typeof body.total === "number" ? body.total : null;
    return { total, rows: items.length, status: response.status, ms, note: "" };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const reset = describeFetchFailure(err).includes("ECONNRESET");
    return {
      total: null,
      rows: 0,
      // A reset from THIS endpoint means the value was rejected, not that the
      // network failed. Saying "连接失败" here would file a finding as noise.
      status: message.includes("abort") ? `超时` : reset ? "值被拒(RST)" : "连接失败",
      ms,
      note: reset ? "服务器直接断开连接 —— 这个端点就是这么拒绝非法参数值的，不是网络问题" : describeFetchFailure(err).slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
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
  console.log("方法：先量一个基准总数，再逐个加参数看总数变不变。");
  console.log("被忽略的参数一样返回 200，长得和生效的一模一样 —— 只有总数会露馅。\n");

  const measuredBaseline = await count(BASE_PARAMS, timeoutMs);
  console.log(`基准（只有必填项）：${measuredBaseline.total ?? "读不到"} 条   ${measuredBaseline.ms}ms`);
  if (measuredBaseline.total === null) {
    console.log(`\n基准就没拿到（${measuredBaseline.status} ${measuredBaseline.note}）。下面全部作废 —— 先把这条修好。`);
    return;
  }
  // Narrowed to a plain number so every comparison below is against a value
  // the compiler knows exists — the baseline is the one number the whole
  // report leans on.
  const baselineTotal: number = measuredBaseline.total;
  console.log();

  // Candidate names come from the PNCP site's own filter UI and from
  // third-party collectors, in both singular and plural spellings, because
  // nothing documents them and a near-miss name is silently ignored rather
  // than rejected.
  const candidates: { label: string; extra: Record<string, string>; role?: "正对照" | "负对照" }[] = [
    { label: "q=obra（关键词）", extra: { q: "obra" }, role: "正对照" },
    { label: "status=em_julgamento（已知无效）", extra: { status: "em_julgamento" }, role: "负对照" },
    { label: "ufs=SP", extra: { ufs: "SP" } },
    { label: "uf=SP", extra: { uf: "SP" } },
    { label: "esferas=M（市级）", extra: { esferas: "M" } },
    { label: "esfera=M", extra: { esfera: "M" } },
    { label: "modalidades=4（Concorrência 电子）", extra: { modalidades: "4" } },
    { label: "modalidade=4", extra: { modalidade: "4" } },
    { label: "modalidade_licitacao_id=4", extra: { modalidade_licitacao_id: "4" } },
    { label: "modalidades_licitacao=4", extra: { modalidades_licitacao: "4" } },
    { label: "municipios=4464", extra: { municipios: "4464" } },
    { label: "orgaos=40314", extra: { orgaos: "40314" } },
    { label: "data_publicacao_inicial=2026-09-17", extra: { data_publicacao_inicial: "2026-09-17" } },
    { label: "dataInicial=20260917", extra: { dataInicial: "20260917" } },
    { label: "tipos_documento=ata（换文档类型）", extra: { tipos_documento: "ata" } },
    { label: "zzz_nao_existe=1（假参数，必须无效）", extra: { zzz_nao_existe: "1" }, role: "负对照" },
  ];

  const results: Probe[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) await sleep(paceMs);
    const params = { ...BASE_PARAMS, ...candidate.extra };
    const measured = await count(params, timeoutMs);
    results.push({ label: candidate.label, params, ...measured });
    const narrowed = measured.total !== null && measured.total < baselineTotal;
    const verdict =
      measured.total === null
        ? `${measured.status}  ${measured.note}`
        : narrowed
          ? `✅ 有效 —— ${measured.total} 条（基准的 ${((measured.total / baselineTotal) * 100).toFixed(1)}%）`
          : `❌ 没过滤 —— ${measured.total} 条，跟基准一样`;
    console.log(`  ${(candidate.role ?? "").padEnd(4)} ${candidate.label.padEnd(36)} ${String(measured.ms).padStart(6)}ms  ${verdict}`);
  }

  console.log("\n" + "─".repeat(72));
  const byLabel = (needle: string) => results.find((r) => r.label.startsWith(needle));
  const positive = byLabel("q=obra");
  const negativeStatus = byLabel("status=em_julgamento");
  const negativeFake = byLabel("zzz_nao_existe");
  const controlsOk =
    positive?.total !== null && positive !== undefined && positive.total < baselineTotal &&
    negativeFake?.total !== null && negativeFake !== undefined && negativeFake.total === baselineTotal;

  if (!controlsOk) {
    console.log("对照组不成立 —— 正对照没缩小，或者假参数反而改变了总数。");
    console.log("这说明这套测量方法本身有问题，上面每一行的结论都不能信。把整段发我。");
    return;
  }
  console.log("对照组通过：q 会缩小结果，假参数不会。所以下面的判断是可信的。");
  if (negativeStatus?.total === baselineTotal) console.log("（status 依旧是「必填但不起作用」—— 跟 2026-09-18 量到的一致。）");

  const working = results.filter((r) => r.total !== null && r.total < baselineTotal && !r.label.startsWith("zzz"));
  console.log(`\n真正能缩小结果的参数：${working.length === 0 ? "一个都没有" : working.map((r) => r.label.split("（")[0]).join("，")}`);
  console.log();
  if (working.filter((r) => !r.label.startsWith("q=")).length === 0) {
    console.log("只有 q 能过滤 —— 那 connector 就只能靠关键词收窄，而关键词匹配的是文本，不是采购方式，也不是金额。");
    console.log("下一步要定的是用哪几个葡语词做这个 q，以及漏掉的项目能不能接受。");
  } else {
    console.log("除了 q 之外还有能用的过滤器 —— 这几个直接决定 connector 每天发多少次请求。");
    console.log("把上面这张表发我，我按能生效的那几个来写查询形状。");
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
