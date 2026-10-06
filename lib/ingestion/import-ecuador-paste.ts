import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { ECUADOR, mapSoceToTender, parseSoceProcedures } from "@/lib/ingestion/ecuador-soce-paste";
import { hasShortBidWindow, isPastSubmissionDeadline, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { EcuadorImportOutcome, EcuadorImportResponse, EcuadorImportRow } from "@/lib/ingestion/ecuador-paste-result";

/**
 * The 厄瓜多尔 tab's 「SOCE 粘贴导入」: procedure pages copied from SOCE, read
 * by ecuador-soce-paste.ts, written through upsertTendersBatched() like every
 * other import — so the platform's filters (the general relevance rules and
 * the US$1M floor, the passed-deadline gate, an admin's earlier delete) apply
 * unchanged (standing rule: 请一定要保障现在应用的筛选规则，在我们导入新项目时，
 * 一样适用).
 *
 * Except the 12-day bidding window: a call the admin chose by hand is written
 * however short its window, as with CFE's pasted pages (user, 2026-10-06: 手动
 * 粘贴的项目不受 12 天限制（你亲自挑的，说明你想看）。其他规则照旧). The admin
 * edit form's own window check skips these rows for the same reason
 * (app/api/admin/tenders/[slug]/route.ts).
 *
 * One code, one row: a page pasted twice updates the same row, and a code
 * already stored for Ecuador is updated in place.
 */
const OUTCOME_ZH: Record<EcuadorImportOutcome, string> = {
  write: "会写入",
  excluded: "按平台规则排除，不写入",
  closed: "交标截止日已过，不写入",
  short_window: `会写入（发布到交标不足 ${SHORT_BID_WINDOW_DAYS} 天，手动粘贴不受此限制）`,
  not_open: "SOCE 上已不在投标阶段，不写入",
};

function outcomeOf(tender: Tender, now: Date): EcuadorImportOutcome {
  if (isPastSubmissionDeadline(tender, now)) return "closed";
  if (tender.status !== "open") return "not_open";
  if (tender.relevance.tier === "excluded") return "excluded";
  if (hasShortBidWindow(tender)) return "short_window";
  return "write";
}

/** Rows already stored for Ecuador under these codes. */
async function existingSlugs(supabase: SupabaseClient, codes: string[]): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  if (codes.length === 0) return bySlug;
  const { data, error } = await supabase.from("tenders").select("slug,tender_number").eq("country", ECUADOR).in("tender_number", codes);
  if (error) throw new Error(`无法核对是否已导入过：${error.message}`);
  for (const row of (data ?? []) as Array<{ slug: string; tender_number: string }>) if (!bySlug.has(row.tender_number)) bySlug.set(row.tender_number, row.slug);
  return bySlug;
}

export async function importEcuadorPaste(supabase: SupabaseClient | null, text: string, options: { write: boolean; now?: Date }): Promise<EcuadorImportResponse> {
  const procedures = parseSoceProcedures(text);
  if (procedures.length === 0) {
    throw new Error("没有找到「Descripción del Proceso de Contratación」——请在 SOCE 项目详情页从这个标题开始，连同下面的「Fechas de Control del Proceso」一起复制。");
  }
  const existing = supabase ? await existingSlugs(supabase, procedures.map((procedure) => procedure.code)) : new Map<string, string>();
  const now = options.now ?? new Date();

  const rows: EcuadorImportRow[] = [];
  const toWrite: Tender[] = [];
  for (const procedure of procedures) {
    const mapped = mapSoceToTender(procedure, now);
    const existingSlug = existing.get(procedure.code);
    const tender = existingSlug && existingSlug !== mapped.slug ? { ...mapped, slug: existingSlug } : mapped;
    const outcome = outcomeOf(tender, now);
    if (outcome === "write" || outcome === "short_window") toWrite.push(tender);
    rows.push({
      code: procedure.code,
      title: tender.title.es,
      buyer: tender.buyer,
      procedureType: tender.procedureType ?? "",
      scopeType: tender.scopeType,
      budget: tender.estimatedValue,
      publicationDate: tender.publicationDateIsEstimated ? undefined : tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      keyDates: tender.keyDates.length,
      tier: tender.relevance.tier,
      reasonZh: tender.relevance.reason.zh,
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
