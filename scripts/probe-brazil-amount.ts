/**
 * Where does a Brazilian tender's money come from?
 *
 * `/api/search` is settled as the discovery path, and it will never supply an
 * amount: `valor_global` was null on 100 of 100 rows. Every tier this
 * platform assigns is a function of the amount — MIN_VALUE_USD,
 * SIGNIFICANT_VALUE_USD, FLAGSHIP_VALUE_USD — so a Brazil connector that
 * cannot resolve one produces rows that cannot be classified, which is worse
 * than no rows.
 *
 * The one thread to pull is `item_url`. A search row carries, for example:
 *
 *   "item_url": "/compras/83102509000172/2026/11"
 *   "numero_controle_pncp": "83102509000172-1-000011/2026"
 *   "orgao_cnpj": "83102509000172",  "ano": "2026",  "numero_sequencial": "11"
 *
 * — the buyer's CNPJ, the year and the sequential number, which is exactly
 * the tuple PNCP's own documentation uses to address a single procurement.
 * `/api/consulta` is the relational service that HAS `valorTotalEstimado`
 * (confirmed: it is in the field list every `/contratacoes/proposta` row
 * returns). If a per-tender lookup keyed on that tuple works, the shape is:
 * discover on the index, resolve the amount one call per tender.
 *
 * That "one call per tender" is the cost being measured here as much as the
 * path. `/api/consulta` is the service that has spent two days at 500, 502,
 * 503, 504 and 63-second responses, so a design that needs it once per row is
 * a design that needs to survive it being down — which is a real constraint
 * on the connector, not a detail.
 *
 * Several address spellings are tried because none of this is documented for
 * the search row's `item_url` specifically, and a guessed path that 404s
 * looks identical to a tender that does not exist. Pass a real `item_url`
 * from a fresh `dump:brazil-search` run rather than relying on the default,
 * which will age out.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-amount -- --item-url /compras/83102509000172/2026/11
 *   npm run probe:brazil-amount -- --cnpj 83102509000172 --ano 2026 --seq 11
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Result = { label: string; url: string; ok: boolean; status: number | string; ms: number; note: string; body?: unknown };

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
    if (response.status === 204 || text.trim() === "") return { label, url, ok: true, status: response.status, ms, note: "答了，但是空的" };
    try {
      return { label, url, ok: true, status: response.status, ms, note: "", body: JSON.parse(text) };
    } catch {
      return { label, url, ok: false, status: response.status, ms, note: `不是 JSON：${text.slice(0, 140)}` };
    }
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { label, url, ok: false, status: message.includes("abort") ? `超时` : "连接失败", ms, note: describeFetchFailure(err).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** Every key anywhere in the response whose name looks like money, with its value — so a renamed field is found rather than reported missing. */
function findAmounts(body: unknown, path = ""): [string, unknown][] {
  if (body === null || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.flatMap((item, i) => findAmounts(item, `${path}[${i}]`));
  return Object.entries(body as Record<string, unknown>).flatMap(([key, value]) => {
    const here = path ? `${path}.${key}` : key;
    const looksLikeMoney = /valor|preco|preço|montante|estimad|homolog/i.test(key);
    const nested = findAmounts(value, here);
    return looksLikeMoney && (typeof value === "number" || typeof value === "string" || value === null) ? [[here, value] as [string, unknown], ...nested] : nested;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 120) || 120) * 1000;

  const itemUrl = arg("--item-url");
  const parsed = itemUrl?.match(/\/compras\/(\d+)\/(\d{4})\/(\d+)/);
  const cnpj = arg("--cnpj") ?? parsed?.[1] ?? "83102509000172";
  const ano = arg("--ano") ?? parsed?.[2] ?? "2026";
  const seq = arg("--seq") ?? parsed?.[3] ?? "11";

  if (itemUrl !== undefined && parsed === null) {
    console.error(`--item-url 认不出来："${itemUrl}"。它长这样：/compras/<CNPJ>/<年>/<序号>`);
    process.exit(1);
  }
  if (arg("--item-url") === undefined && arg("--cnpj") === undefined) {
    console.log("⚠️  用的是写死的默认值（2026-09-18 抓到的那条），它迟早会失效。");
    console.log("   先跑 npm run dump:brazil-search，从输出里挑一条新鲜的 item_url 传进来：");
    console.log("   npm run probe:brazil-amount -- --item-url /compras/<CNPJ>/<年>/<序号>\n");
  }
  console.log(`找金额 — CNPJ ${cnpj}，年 ${ano}，序号 ${seq}\n`);

  const candidates: { label: string; url: string }[] = [
    { label: "A. /api/consulta 单条采购", url: `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}` },
    { label: "B. /api/pncp 单条采购（免鉴权的那部分）", url: `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}` },
    { label: "C. 单条采购的明细项（有时候金额只在明细里）", url: `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens` },
    { label: "D. /api/consulta 的明细项", url: `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens` },
  ];

  const results: Result[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) await sleep(2000);
    console.log(candidate.label);
    console.log(`   ${candidate.url}`);
    const result = await probe(candidate.label, candidate.url, timeoutMs);
    results.push(result);
    console.log(`   ${result.ok ? "OK  " : "FAIL"}  ${String(result.status).padEnd(12)} ${String(result.ms).padStart(7)}ms  ${result.note}`);
    if (result.body !== undefined) {
      const amounts = findAmounts(result.body);
      console.log(`   跟金额有关的字段：${amounts.length === 0 ? "一个都没有" : ""}`);
      for (const [key, value] of amounts.slice(0, 15)) console.log(`     ${key} = ${value === null ? "null" : String(value)}`);
      console.log("   全文：");
      console.log(
        JSON.stringify(result.body, null, 2)
          .split("\n")
          .slice(0, 60)
          .map((line) => `     ${line}`)
          .join("\n"),
      );
    }
    console.log();
  }

  console.log("─".repeat(72));
  console.log("小结\n");
  for (const r of results) console.log(`  ${(r.ok ? "OK  " : "FAIL").padEnd(5)} ${String(r.status).padEnd(12)} ${String(r.ms).padStart(7)}ms  ${r.label}`);
  console.log();
  const withMoney = results.filter((r) => r.body !== undefined && findAmounts(r.body).some(([, v]) => v !== null && v !== 0));
  if (withMoney.length > 0) {
    console.log(`拿到金额了：${withMoney.map((r) => r.label.split(".")[0]).join("，")}`);
    console.log("connector 的形状就定了：/api/search 负责发现，然后每条回这里取金额。");
    console.log("注意这条路每条项目一次请求，而 /api/consulta 这两天 500/502/503/504 都出过 —— 取不到金额得能接受，不能整轮失败。");
  } else {
    console.log("四条路都没给出金额。把上面每一段发我 —— 尤其是返回 200 但没有 valor 字段的那些，");
    console.log("那说明金额在另一个端点上，不是在这条记录里。");
  }
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
