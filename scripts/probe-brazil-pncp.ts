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
 * This script tries them in that order and reports timings, so a failure
 * says WHICH endpoint failed rather than "Brazil doesn't work".
 *
 * The modalities call is the CONTROL GROUP, same discipline as
 * probe-colombia-sources.ts: it is known to answer. If the control fails
 * too, the problem is this machine's network and every other result here is
 * meaningless — the report says so rather than letting you read timeouts as
 * findings.
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

async function attempt(label: string, url: string, timeoutMs = 60_000): Promise<Attempt> {
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
  const idx = args.indexOf("--days");
  const days = Math.max(1, Number(idx >= 0 ? args[idx + 1] : 3) || 3);

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);

  console.log(`PNCP 探针 — 窗口 ${pncpDay(from)} 到 ${pncpDay(now)}（${days} 天）\n`);

  const results: Attempt[] = [];

  // 1. Control. Known to answer instantly in a previous real run.
  console.log("【对照组】modalidades —— 已知可用。这条挂了，下面全部作废。");
  const control = await attempt("modalidades（对照组）", MODALIDADES_URL, 30_000);
  results.push(control);
  console.log(`  ${control.ok ? "OK" : "FAIL"}  ${control.status}  ${control.ms}ms\n      ${control.note}\n`);

  if (!control.ok) {
    console.log("对照组失败 —— 这台机器连 PNCP 已知可用的端点都读不到，所以下面无论出什么都说明不了 PNCP 的问题。先解决网络/WAF，再跑一次。\n");
  }

  // 2. The new candidate: tenders with an OPEN proposal window.
  console.log("【1】/v1/contratacoes/proposta —— 正在接收投标的采购（截图里新发现的端点）");
  const proposta = await attempt(
    "contratacoes/proposta",
    `${BASE}/v1/contratacoes/proposta?dataFinal=${pncpDay(now)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`,
  );
  results.push(proposta);
  console.log(`  ${proposta.ok ? "OK" : "FAIL"}  ${proposta.status}  ${proposta.ms}ms\n      ${proposta.note}\n`);

  // 3. The one that timed out before. Same narrow request, to see whether the
  //    504 is still there — "worth retrying later rather than assuming it's
  //    permanently broken" is what the README says, so this retries it.
  console.log("【2】/v1/contratacoes/publicacao —— 之前两次都 504，这里复测");
  const publicacao = await attempt(
    "contratacoes/publicacao",
    `${BASE}/v1/contratacoes/publicacao?dataInicial=${pncpDay(from)}&dataFinal=${pncpDay(now)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`,
  );
  results.push(publicacao);
  console.log(`  ${publicacao.ok ? "OK" : "FAIL"}  ${publicacao.status}  ${publicacao.ms}ms\n      ${publicacao.note}\n`);

  // 4. Concorrência Eletrônica — the modality that carries large works, as
  //    opposed to Pregão Eletrônico (code 6) which carries commodity goods.
  //    Worth a separate probe because if only ONE modality answers, that
  //    decides which one the connector starts with.
  console.log("【3】/v1/contratacoes/proposta，modalidade 4（Concorrência Eletrônica，大工程走这条）");
  const concorrencia = await attempt(
    "contratacoes/proposta modalidade=4",
    `${BASE}/v1/contratacoes/proposta?dataFinal=${pncpDay(now)}&codigoModalidadeContratacao=4&pagina=1&tamanhoPagina=10`,
  );
  results.push(concorrencia);
  console.log(`  ${concorrencia.ok ? "OK" : "FAIL"}  ${concorrencia.status}  ${concorrencia.ms}ms\n      ${concorrencia.note}\n`);

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const r of results) {
    console.log(`  ${(r.ok ? "OK  " : "FAIL").padEnd(5)} ${String(r.status).padEnd(12)} ${String(r.ms).padStart(6)}ms  ${r.label}`);
  }
  console.log();
  if (!control.ok) {
    console.log("对照组挂了 —— 上面的结论一个都不成立。");
  } else if (proposta.ok || concorrencia.ok) {
    console.log("至少一个 /proposta 查询通了。把上面打印的【字段】清单发我，mapper 按真实字段写，不按 Swagger 截图写。");
    console.log("还需要的一步：真实葡语标题。字段清单里会有标题字段名，拿它抓 30~50 条真实标题给我，规则就有了依据。");
  } else {
    console.log("对照组通了但两个 contratacoes 端点都没通 —— 说明 504 还在，而且不只影响 /publicacao。");
    console.log("那就先不写 connector；这是 PNCP 自己的问题，不是参数问题。");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
