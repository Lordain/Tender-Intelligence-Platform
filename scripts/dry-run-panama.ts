/**
 * A read-only trial of PanamaCompra (Panama). Added 2026-10-06 (user: 好的，
 * 请开始, for 开发分支试运行，只出报告，不写数据库). It never connects to
 * Supabase: it reads the public list and detail calls, maps each procedure as
 * a Tender and runs it through the platform's relevance rules, then prints
 * what would be kept.
 *
 * Usage:
 *   npm run dry-run:panama                (the last 30 days)
 *   npm run dry-run:panama -- --days 14
 *   npm run dry-run:panama -- --json exports/panama-dry-run.json
 *
 * Behind an HTTPS proxy (a sandbox, a corporate network) Node's fetch ignores
 * HTTPS_PROXY unless started with NODE_USE_ENV_PROXY=1; without it the
 * request went out direct and came back 502 "protocol error".
 */
import { writeFileSync } from "node:fs";
import {
  PANAMA_TENDER_TYPES,
  fetchPanamaDetalle,
  fetchPanamaProcesos,
  pausePanamaDetail,
  type PanamaDetalle,
  type PanamaProceso,
} from "../lib/ingestion/connectors/panama-panamacompra-live";
import { mapPanamaProcesoToTender } from "../lib/ingestion/panama-mapper";
import type { Tender } from "../types/tender";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
/** Statuses still worth a bidder's attention; the detail is read only for these. */
const LIVE_STATUSES = /^(vigente|por adjudicar|suspendido|en reclamo|por autorizar)$/i;

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
}

function money(value: number | undefined): string {
  return value === undefined ? "—" : `US$${Math.round(value).toLocaleString("en-US")}`;
}

async function main() {
  const days = Number(flag("--days") ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("--days 需要 1–90 之间的整数");
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const byNumber = new Map<string, PanamaProceso>();
  for (const [id, name] of Object.entries(PANAMA_TENDER_TYPES)) {
    const { rows, truncated } = await fetchPanamaProcesos(Number(id), from, now.toISOString());
    for (const row of rows) byNumber.set(row.numProceso, row);
    console.log(`  ${name}: ${rows.length} 行${truncated ? "（翻页上限，可能不全）" : ""}`);
  }
  const procesos = [...byNumber.values()];
  const live = procesos.filter((proceso) => LIVE_STATUSES.test(proceso.nombreRealizado.trim()));
  console.log(`\n近 ${days} 天有状态变化的正式招标 ${procesos.length} 条（去重后），其中仍在进行 ${live.length} 条，逐条读取详情……`);

  const tenders: { proceso: PanamaProceso; tender: Tender; detalle?: PanamaDetalle }[] = [];
  let detailErrors = 0;
  for (const proceso of live) {
    let detalle: PanamaDetalle | undefined;
    try {
      detalle = await fetchPanamaDetalle(proceso);
    } catch (error) {
      detailErrors += 1;
      console.error(`  详情失败 ${proceso.numProceso}：${error instanceof Error ? error.message : String(error)}`);
    }
    tenders.push({ proceso, detalle, tender: mapPanamaProcesoToTender(proceso, detalle, now) });
    await pausePanamaDetail();
  }

  const count = (test: (tender: Tender) => boolean) => tenders.filter(({ tender }) => test(tender)).length;
  console.log(`\n=== 结果（详情失败 ${detailErrors} 条）===`);
  console.log(`有参考价 ${count((t) => t.estimatedValue !== undefined)} 条，有交标截止 ${count((t) => !!t.submissionDeadline)} 条`);
  for (const tier of ["flagship", "significant", "standard", "excluded"]) {
    console.log(`  ${TIER_LABEL[tier]}：${count((t) => t.relevance.tier === tier)}（其中招标中 ${count((t) => t.relevance.tier === tier && t.status === "open")}）`);
  }

  const kept = tenders.filter(({ tender }) => tender.relevance.tier !== "excluded");
  kept.sort((a, b) => (b.tender.estimatedValue ?? 0) - (a.tender.estimatedValue ?? 0));
  console.log(`\n=== 会保留的 ${kept.length} 条 ===`);
  for (const { tender } of kept) {
    console.log(
      `  [${TIER_LABEL[tender.relevance.tier]}·${tender.status}] ${money(tender.estimatedValue)} | ${tender.industries.join("/") || "—"} | ` +
        `截止 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | ${tender.buyer.slice(0, 40)} | ${tender.title.es.slice(0, 80)}`,
    );
  }

  const reasons = new Map<string, number>();
  for (const { tender } of tenders) if (tender.relevance.tier === "excluded") reasons.set(tender.relevance.reason.zh, (reasons.get(tender.relevance.reason.zh) ?? 0) + 1);
  console.log(`\n=== 排除原因 ===`);
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n} × ${reason}`);

  const jsonPath = flag("--json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(tenders.map(({ proceso, tender }) => ({ estado: proceso.nombreRealizado, tender })), null, 2));
    console.log(`\n明细已写到 ${jsonPath}`);
  }
  console.log(`\n试运行：只读了 PanamaCompra 的公开接口，没有连接数据库，什么都没写。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
