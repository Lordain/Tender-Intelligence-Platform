/**
 * Brazil has more than one door. This knocks on the other ones.
 *
 * Everything so far has gone through PNCP's `/api/consulta`, and that one
 * endpoint has now failed three different ways in two days: 63-second
 * responses, a total 503 outage, and a rate limiter that trips at roughly ten
 * requests in five seconds. Before a connector is built on it, it is worth
 * knowing what else exists — the question the user asked on 2026-09-18.
 *
 * Four candidates, and what is actually known about each (from public
 * documentation and third-party code, NOT from a request this sandbox made —
 * pncp.gov.br and every other .gov.br host are blocked here, which is why
 * this is a script for the user to run rather than a finding):
 *
 *   A. pncp.gov.br/api/search — THE INTERESTING ONE.
 *      This is what the PNCP website's own search box calls
 *      (pncp.gov.br/app/editais), and multiple third-party collectors use it
 *      directly: `?q=<termo>&tipos_documento=edital&ordenacao=-data
 *      &pagina=1&tam_pagina=100`, plus `municipios=` / `ufs=`.
 *      Three reasons it matters more than a second copy of the same data:
 *        · It is a DIFFERENT BACKEND. `/api/consulta` fails with Hikari JDBC
 *          pool errors — a relational database. A site search box that stays
 *          responsive while that is down is almost certainly an index, not
 *          the same tables, so the two should fail independently.
 *        · `tam_pagina=100` against /consulta's 10–50 — a quarter of the
 *          requests for the same coverage, which directly addresses the
 *          rate limiter.
 *        · `q=` is server-side keyword filtering. Every other source in this
 *          project pulls everything and filters locally.
 *      The catch, and the whole reason this probe prints raw rows: a search
 *      index usually returns a SUMMARY. If `valorTotalEstimado` and the
 *      cronograma dates are missing, it is a discovery endpoint that still
 *      needs /consulta (or the item detail) for the money — useful, but a
 *      different design. Fields decide that, nothing else.
 *
 *   B. dadosabertos.compras.gov.br — Compras.gov.br open data (SIASG).
 *      A genuinely separate API with its own Swagger, no auth. FEDERAL ONLY:
 *      it does not carry state or municipal procurement, which PNCP does. So
 *      it is a complement and a cross-check, never a replacement.
 *
 *   C. contratos.comprasnet.gov.br/api — federal CONTRACTS (signed), not open
 *      tenders. Wrong half of the lifecycle for this platform's main feed;
 *      relevant later for award outcomes.
 *
 *   D. api.queridodiario.ok.org.br — municipal official gazettes, full-text,
 *      open, self-declared ~60 req/min. The Brazilian analogue of the DOF
 *      connector we already run for Mexico. It reaches small municipalities
 *      that never reach PNCP at all, but it returns GAZETTE TEXT, not
 *      structured tenders — the same extraction problem the DOF mapper
 *      solves, in Portuguese. Probed here only to confirm it answers.
 *
 * What this script does NOT do is pick one. It prints status, latency and the
 * real field names of the first row from each, so the choice is made against
 * returned data rather than against this comment.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-alt
 *   npm run probe:brazil-alt -- --q "obra" --timeout 120
 */
export {};

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

type Result = { label: string; url: string; ok: boolean; status: number | string; ms: number; note: string; first?: Record<string, unknown> };

async function probe(label: string, url: string, timeoutMs: number): Promise<Result> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const ms = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { label, url, ok: false, status: response.status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) };
    }
    if (response.status === 204 || text.trim() === "") {
      return { label, url, ok: true, status: response.status, ms, note: "答了，但是空的（没有匹配的记录）" };
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { label, url, ok: false, status: response.status, ms, note: `返回的不是 JSON：${text.slice(0, 140)}` };
    }
    // Every one of these APIs wraps its rows differently, and guessing the
    // wrapper is how a working endpoint gets reported as empty. Try the known
    // shapes, then fall back to describing the envelope itself.
    const record = body as Record<string, unknown>;
    const rows = (Array.isArray(body) ? body : record.data ?? record.items ?? record.resultado ?? record.gazettes ?? record.content) as unknown[] | undefined;
    const total = record.total ?? record.totalRegistros ?? record.totalElements ?? record.total_gazettes ?? (Array.isArray(rows) ? rows.length : undefined);
    if (!Array.isArray(rows)) {
      return { label, url, ok: true, status: response.status, ms, note: `答了，但没认出行在哪：外层键 ${Object.keys(record).join(", ")}` };
    }
    const first = rows[0] as Record<string, unknown> | undefined;
    return {
      label,
      url,
      ok: true,
      status: response.status,
      ms,
      note: `${total ?? "?"} 条，本页 ${rows.length} 行`,
      ...(first ? { first } : {}),
    };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { label, url, ok: false, status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败", ms, note: message.slice(0, 180) };
  } finally {
    clearTimeout(timer);
  }
}

function pncpDay(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
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

  console.log(`巴西其他数据接口 — 关键词 "${q}"，每条最多等 ${Math.round(timeoutMs / 1000)}s\n`);

  const targets: { label: string; url: string; why: string }[] = [
    {
      label: "A1. PNCP /api/search（网站自己的搜索，按关键词）",
      url: `https://pncp.gov.br/api/search/?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10`,
      why: "跟 /api/consulta 大概率不是同一个后端 —— 那边挂了这边可能还活着",
    },
    {
      label: "A2. PNCP /api/search（不带关键词，只按日期倒序）",
      url: "https://pncp.gov.br/api/search/?tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10",
      why: "确认 q 是可选的；这才是每日全量导入会用的形状",
    },
    {
      label: "A3. PNCP /api/consulta（对照组，已知的那条）",
      url: `https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=${today}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`,
      why: "同一次运行里对比 —— 快慢和字段完整度都得跟 A1/A2 摆在一起看",
    },
    {
      label: "B. Compras.gov.br 开放数据（联邦，SIASG）",
      url: "https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?pagina=1&tamanhoPagina=10",
      why: "独立的一套 API。只有联邦，没有州和市 —— 是补充不是替代",
    },
    {
      label: "D. Querido Diário（市级公报全文）",
      url: `https://queridodiario.ok.org.br/api/gazettes?querystring=${encodeURIComponent(q)}&size=5`,
      why: "相当于墨西哥的 DOF：够得着根本不上 PNCP 的小城市，但返回的是公报正文不是结构化标讯",
    },
  ];

  const results: Result[] = [];
  for (const [index, target] of targets.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`${target.label}`);
    console.log(`   为什么试它：${target.why}`);
    console.log(`   ${target.url}`);
    const result = await probe(target.label, target.url, timeoutMs);
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
  }

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const r of results) {
    console.log(`  ${(r.ok ? "OK  " : "FAIL").padEnd(5)} ${String(r.status).padEnd(12)} ${String(r.ms).padStart(7)}ms  ${r.label}`);
  }
  console.log();
  console.log("把上面每一段的【字段】和【第一行全文】发我。要判断的就一件事：");
  console.log("  /api/search 返回的是完整记录，还是只是个搜索摘要？");
  console.log("  有 valorTotalEstimado、收标截止日期、采购单位 → 它可以整个替掉 /api/consulta；");
  console.log("  只有标题和链接 → 它负责发现，金额还得回 /api/consulta 取，那是另一种设计。");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
