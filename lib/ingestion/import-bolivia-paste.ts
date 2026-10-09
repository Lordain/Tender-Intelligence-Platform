import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { BOLIVIA, mapSicoesToTender, parseSicoesProcesses } from "@/lib/ingestion/bolivia-sicoes-paste";
import { hasShortBidWindow, isPastSubmissionDeadline, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { BOLIVIA_KEEP_TIERS, type BoliviaImportOutcome, type BoliviaImportResponse, type BoliviaImportRow, type BoliviaKeepTier } from "@/lib/ingestion/bolivia-paste-result";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import { convertToUsd } from "@/lib/currency";

/**
 * The 玻利维亚 tab's 「SICOES 粘贴导入」: Ficha pages copied from SICOES, read
 * by bolivia-sicoes-paste.ts, written through upsertTendersBatched() like
 * every other import — so the platform's filters (the general relevance rules
 * and the US$1M floor, the passed-deadline gate, an admin's earlier delete)
 * apply unchanged (standing rule: 请一定要保障现在应用的筛选规则，在我们导入新
 * 项目时，一样适用). The same exceptions as Ecuador's paste
 * (import-ecuador-paste.ts): no 12-day window for a call the admin chose by
 * hand, and an excluded process can be kept at a tier the admin picks.
 *
 * One CUCE, one row: a Ficha pasted twice updates the same row.
 */
const OUTCOME_ZH: Record<BoliviaImportOutcome, string> = {
  write: "会写入",
  excluded: "按平台规则排除，不写入",
  closed: "交标截止日已过，不写入",
  short_window: `会写入（发布到交标不足 ${SHORT_BID_WINDOW_DAYS} 天，手动粘贴不受此限制）`,
  not_open: "已不在投标阶段，不写入",
  manual_keep: "按你的选择手动保留，会写入",
};

/** What the admin edit form writes when a tier is changed by hand (app/api/admin/tenders/[slug]/route.ts). */
const MANUAL_REASON = { zh: "管理员在后台手动设置", en: "Manually set by an admin", es: "Establecido manualmente por un administrador" };

function outcomeOf(tender: Tender, now: Date): BoliviaImportOutcome {
  if (isPastSubmissionDeadline(tender, now)) return "closed";
  if (tender.status !== "open") return "not_open";
  if (tender.relevance.tier === "excluded") return "excluded";
  if (hasShortBidWindow(tender)) return "short_window";
  return "write";
}

/** Rows already stored for Bolivia under these CUCEs. */
async function existingSlugs(supabase: SupabaseClient, cuces: string[]): Promise<Map<string, string>> {
  const byCuce = new Map<string, string>();
  if (cuces.length === 0) return byCuce;
  const { data, error } = await supabase.from("tenders").select("slug,tender_number").eq("country", BOLIVIA).in("tender_number", cuces);
  if (error) throw new Error(`无法核对是否已导入过：${error.message}`);
  for (const row of (data ?? []) as Array<{ slug: string; tender_number: string }>) {
    if (!byCuce.has(row.tender_number)) byCuce.set(row.tender_number, row.slug);
  }
  return byCuce;
}

export async function importBoliviaPaste(
  supabase: SupabaseClient | null,
  text: string,
  options: { write: boolean; now?: Date; /** CUCE → tier, for excluded processes kept by hand. */ keep?: Record<string, BoliviaKeepTier> },
): Promise<BoliviaImportResponse> {
  const processes = parseSicoesProcesses(text);
  if (processes.length === 0) {
    throw new PasteInputError("没有找到「1. IDENTIFICACIÓN DE LA ENTIDAD」和 CUCE——请在 SICOES 点「Ver Ficha」，从这个标题开始全选整页复制。");
  }
  const existing = supabase ? await existingSlugs(supabase, processes.map((process) => process.cuce)) : new Map<string, string>();
  const now = options.now ?? new Date();

  const rows: BoliviaImportRow[] = [];
  const toWrite: Tender[] = [];
  for (const process of processes) {
    const mapped = mapSicoesToTender(process, now);
    const existingSlug = existing.get(process.cuce);
    let tender: Tender = existingSlug && existingSlug !== mapped.slug ? { ...mapped, slug: existingSlug } : mapped;
    let outcome = outcomeOf(tender, now);
    const keepTier = options.keep?.[process.cuce];
    if (outcome === "excluded" && keepTier && BOLIVIA_KEEP_TIERS.includes(keepTier)) {
      tender = { ...tender, relevance: { tier: keepTier, label: RELEVANCE_TIER_LABELS[keepTier], reason: MANUAL_REASON }, relevanceManuallyOverridden: true };
      outcome = "manual_keep";
    }
    if (outcome === "write" || outcome === "short_window" || outcome === "manual_keep") toWrite.push(tender);
    const usd = tender.estimatedValue !== undefined ? convertToUsd(tender.estimatedValue, tender.currency) : null;
    rows.push({
      cuce: process.cuce,
      title: tender.title.es,
      buyer: tender.buyer,
      procedureType: tender.procedureType ?? "",
      scopeType: tender.scopeType,
      budget: tender.estimatedValue,
      currency: tender.currency,
      ...(usd !== null ? { budgetUsd: usd } : {}),
      international: tender.participationScope === "international_open",
      publicationDate: tender.publicationDateIsEstimated ? undefined : tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      keyDates: tender.keyDates.length,
      tier: tender.relevance.tier,
      reasonZh: tender.relevance.reason.zh,
      ruleTier: mapped.relevance.tier,
      outcome,
      outcomeZh: OUTCOME_ZH[outcome],
      ...(existingSlug ? { existingSlug } : {}),
    });
  }

  if (!options.write) return { rows };
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const result = await upsertTendersBatched(supabase, toWrite, undefined, { allowShortBidWindow: true });
  return { rows, written: result.upsertedCount, failed: result.failed };
}
