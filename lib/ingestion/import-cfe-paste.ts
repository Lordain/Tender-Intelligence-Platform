import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { cfeNotOpenReason, mapCfeMicrositioProcedure, parseCfeMicrositioPaste } from "@/lib/ingestion/cfe-micrositio-paste";
import { hasShortBidWindow, isPastSubmissionDeadline, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { CFE_MICROSITIO_SOURCE_NAME } from "@/lib/relevance-cfe";
import type { CfePasteOutcome, CfePasteResponse, CfePasteRow } from "@/lib/ingestion/cfe-paste-result";

/**
 * The admin's 「CFE 网站粘贴导入」: text copied from CFE's micrositio, read by
 * lib/ingestion/cfe-micrositio-paste.ts, written through
 * upsertTendersBatched() like every other import — so the platform's filters
 * (CFE's own relevance rules, the passed-deadline gate, the 12-day window,
 * an admin's earlier delete) apply unchanged (standing rule: 请一定要保障现在
 * 应用的筛选规则，在我们导入新项目时，一样适用).
 *
 * One call, one row (user, 2026-10-06: 如果我手动贴，就要避免DOF（晚几天公告
 * 时），重复加载). Both directions are handled by the procedure number:
 *   - pasted after the DOF already brought it in: the paste is written onto
 *     the DOF's row (its slug), replacing its content with the micrositio's;
 *   - the DOF printing it days after the paste: import-dof-search-live.ts
 *     skips any number already stored from the micrositio.
 */
const OUTCOME_ZH: Record<CfePasteOutcome, string> = {
  write: "会写入",
  excluded: "按 CFE 规则排除，不写入",
  closed: "交标截止日已过，不写入",
  short_window: `发布到交标不足 ${SHORT_BID_WINDOW_DAYS} 天（常规项目、无金额），按平台规则不写入`,
  not_open: "",
};

function outcomeOf(tender: Tender): CfePasteOutcome {
  if (isPastSubmissionDeadline(tender)) return "closed";
  if (tender.relevance.tier === "excluded") return "excluded";
  if (hasShortBidWindow(tender)) return "short_window";
  return "write";
}

/** Rows already stored under these numbers, any source: the DOF's copy, or an earlier paste. */
async function existingSlugs(supabase: SupabaseClient, numbers: string[]): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  if (numbers.length === 0) return bySlug;
  const { data, error } = await supabase.from("tenders").select("slug,tender_number,source_name").in("tender_number", numbers);
  if (error) throw new Error(`无法核对是否已导入过：${error.message}`);
  const rows = (data ?? []) as Array<{ slug: string; tender_number: string; source_name: string | null }>;
  // An earlier paste first, so pasting the same page twice updates that row.
  rows.sort((a, b) => Number(b.source_name === CFE_MICROSITIO_SOURCE_NAME) - Number(a.source_name === CFE_MICROSITIO_SOURCE_NAME));
  for (const row of rows) if (!bySlug.has(row.tender_number)) bySlug.set(row.tender_number, row.slug);
  return bySlug;
}

export async function importCfePaste(supabase: SupabaseClient | null, text: string, options: { write: boolean }): Promise<CfePasteResponse> {
  const procedures = parseCfeMicrositioPaste(text);
  if (procedures.length === 0) throw new Error("没有找到「Procedimiento No.」——请从 CFE 项目详情页顶部的标题开始，整页复制。");

  const existing = supabase ? await existingSlugs(supabase, procedures.map((procedure) => procedure.number)) : new Map<string, string>();
  const now = new Date();
  const rows: CfePasteRow[] = [];
  const toWrite: Tender[] = [];

  for (const procedure of procedures) {
    const mapped = mapCfeMicrositioProcedure(procedure, now);
    const existingSlug = existing.get(procedure.number);
    const tender = existingSlug && existingSlug !== mapped.slug ? { ...mapped, slug: existingSlug } : mapped;
    const notOpen = cfeNotOpenReason(procedure);
    const outcome: CfePasteOutcome = notOpen ? "not_open" : outcomeOf(tender);
    if (!notOpen) toWrite.push(tender);
    rows.push({
      number: procedure.number,
      title: tender.title.es,
      buyer: tender.buyer,
      location: tender.location,
      procedureType: tender.procedureType,
      scopeType: tender.scopeType,
      publicationDate: tender.publicationDateIsEstimated ? undefined : tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      status: tender.status,
      tier: tender.relevance.tier,
      reasonZh: tender.relevance.reason.zh,
      outcome,
      outcomeZh: notOpen ?? OUTCOME_ZH[outcome],
      files: procedure.files.length,
      keyDates: tender.keyDates.length,
      ...(existingSlug ? { existingSlug } : {}),
    });
  }

  if (!options.write) return { rows };
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const result = await upsertTendersBatched(supabase, toWrite);
  return { rows, written: result.upsertedCount, failed: result.failed };
}
