import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { isIngestedArceTender } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { mapArceReleaseToTender, URUGUAY } from "@/lib/ingestion/uruguay-mapper";
import { arceDetailToRelease, arceListCallToRelease, attachArcePurchaseIds, isArceSaleOrLease, parseArceDetailPages, parseArceList } from "@/lib/ingestion/uruguay-arce-paste";
import { uruguayDocumentLinks, uruguayTime } from "@/lib/ingestion/uruguay-mapper";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { hasShortBidWindow, isPastSubmissionDeadline, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import {
  readMarkdownLinks,
  URUGUAY_KEEP_TIERS,
  type ArceDetailPaste,
  type ArceLink,
  type UruguayDetailResponse,
  type UruguayDetailRow,
  type UruguayKeepTier,
  type UruguayPasteOutcome,
  type UruguayPasteResponse,
  type UruguayPasteRow,
} from "@/lib/ingestion/uruguay-paste-result";

/**
 * The 乌拉圭 tab's 「ARCE 列表粘贴导入」 (user, 2026-10-15: 现在就做). ARCE has
 * refused our servers since 2026-10-14 while the site stays open to visitors,
 * and the owner will not contact them; so while the daily OCDS import is
 * paused, the admin copies ARCE's 「Llamados vigentes」 list in their own
 * browser and pastes it here. Nothing is fetched.
 *
 * The same reach and rules as the daily import (standing rule: 请一定要保障现在
 * 应用的筛选规则，在我们导入新项目时，一样适用): every Licitación Pública, the key
 * buyers' Licitaciones Abreviadas (isIngestedArceTender), the general
 * relevance rules through the same mapper, the passed-deadline gate and an
 * admin's earlier delete in upsertTendersBatched. Sales and leases of state
 * property (Venta/Arrendamiento) are not procurement and are not read. As for
 * every paste import, no 12-day window for a call the admin chose by hand,
 * and an excluded call can be kept at a tier the admin picks.
 *
 * Stored under the purchase id, uruguay-{id}, the daily import's own slug: a
 * call already on the platform is left as it is (the feed gave it its items
 * and documents, which the list does not carry), and the day ARCE answers
 * again the daily import updates these rows instead of adding twins.
 */
const OUTCOME_ZH: Record<UruguayPasteOutcome, string> = {
  write: "会写入",
  short_window: `会写入（发布到交标不足 ${SHORT_BID_WINDOW_DAYS} 天，手动粘贴不受此限制）`,
  manual_keep: "按你的选择手动保留，会写入",
  excluded: "按平台规则排除，不写入",
  closed: "交标截止日已过，不写入",
  not_open: "已不在投标阶段，不写入",
  exists: "平台上已有，不重复写入",
  no_id: "没拿到项目 ID，不写入（请在 ARCE 页面上直接复制粘贴，不要先贴到记事本）",
};

const MANUAL_REASON = { zh: "管理员在后台手动设置", en: "Manually set by an admin", es: "Establecido manualmente por un administrador" };

function outcomeOf(tender: Tender, now: Date): UruguayPasteOutcome {
  if (isPastSubmissionDeadline(tender, now)) return "closed";
  if (tender.status !== "open") return "not_open";
  if (tender.relevance.tier === "excluded") return "excluded";
  if (hasShortBidWindow(tender)) return "short_window";
  return "write";
}

async function storedSlugs(supabase: SupabaseClient, slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const { data, error } = await supabase.from("tenders").select("slug").eq("country", URUGUAY).in("slug", slugs);
  if (error) throw new Error(`无法核对是否已导入过：${error.message}`);
  return new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
}

export async function importUruguayPaste(
  supabase: SupabaseClient | null,
  text: string,
  options: { write: boolean; links?: ArceLink[]; now?: Date; /** purchase id → tier, for excluded calls kept by hand. */ keep?: Record<string, UruguayKeepTier> },
): Promise<UruguayPasteResponse> {
  const markdown = readMarkdownLinks(text);
  const listed = attachArcePurchaseIds(parseArceList(markdown.text), [...(options.links ?? []), ...markdown.links]);
  if (listed.length === 0) {
    throw new PasteInputError("没有找到「Ver detalles de la compra …」——请在 ARCE「Consulta de Publicaciones → Llamados vigentes」列表页全选复制，直接粘贴到这里。");
  }
  const now = options.now ?? new Date();

  const notRead = new Map<string, number>();
  let notProcurement = 0;
  const read = [];
  for (const call of listed) {
    if (isArceSaleOrLease(call)) {
      notProcurement += 1;
      continue;
    }
    const release = arceListCallToRelease(call);
    if (!isIngestedArceTender(release)) {
      notRead.set(call.procedure, (notRead.get(call.procedure) ?? 0) + 1);
      continue;
    }
    read.push({ call, release });
  }

  const ids = [...new Set(read.map(({ call }) => call.purchaseId).filter((id): id is string => Boolean(id)))];
  const existing = supabase ? await storedSlugs(supabase, ids.map((id) => `uruguay-${id}`)) : new Set<string>();

  const rows: UruguayPasteRow[] = [];
  const toWrite: Tender[] = [];
  const seen = new Set<string>();
  for (const { call, release } of read) {
    const mapped = mapArceReleaseToTender(release, now);
    let tender = mapped;
    // The rules decide first, so the screening can still say a call without an id is worth opening.
    let outcome: UruguayPasteOutcome = call.purchaseId && existing.has(mapped.slug) ? "exists" : outcomeOf(tender, now);
    if (!call.purchaseId && (outcome === "write" || outcome === "short_window")) outcome = "no_id";
    const keepTier = call.purchaseId ? options.keep?.[call.purchaseId] : undefined;
    if (outcome === "excluded" && keepTier && URUGUAY_KEEP_TIERS.includes(keepTier)) {
      tender = { ...tender, relevance: { tier: keepTier, label: RELEVANCE_TIER_LABELS[keepTier], reason: MANUAL_REASON }, relevanceManuallyOverridden: true };
      outcome = "manual_keep";
    }
    // The same call pasted twice (two pages overlapping) is one row.
    if (call.purchaseId) {
      if (seen.has(call.purchaseId)) continue;
      seen.add(call.purchaseId);
    }
    if (outcome === "write" || outcome === "short_window" || outcome === "manual_keep") toWrite.push(tender);
    rows.push({
      procedureNumber: call.procedureNumber,
      ...(call.purchaseId ? { purchaseId: call.purchaseId, url: tender.sourceUrl } : {}),
      title: tender.title.es,
      buyer: tender.buyer,
      publicationDate: tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      tier: tender.relevance.tier,
      reasonZh: tender.relevance.reason.zh,
      ruleTier: mapped.relevance.tier,
      outcome,
      outcomeZh: OUTCOME_ZH[outcome],
      ...(outcome === "exists" ? { existingSlug: mapped.slug } : {}),
    });
  }

  const result: UruguayPasteResponse = {
    rows,
    notRead: [...notRead].map(([procedure, count]) => ({ procedure, count })).sort((a, b) => b.count - a.count),
    notProcurement,
  };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await upsertTendersBatched(supabase, toWrite, undefined, { allowShortBidWindow: true });
  return { ...result, written: written.upsertedCount, failed: written.failed };
}

/**
 * The first step (user, 2026-10-15: 1层是分析哪些项目值得录入): the list read
 * with the same rules, nothing written. The admin opens the calls worth it
 * and pastes their detail pages into importUruguayDetails.
 */
export function screenUruguayList(supabase: SupabaseClient | null, text: string, links: ArceLink[], now?: Date): Promise<UruguayPasteResponse> {
  return importUruguayPaste(supabase, text, { write: false, links, now });
}

/** The id a paste's links agree on: the one detail id they name most often. */
function pasteId(links: ArceLink[]): string | undefined {
  const counts = new Map<string, number>();
  for (const link of links) counts.set(link.purchaseId, (counts.get(link.purchaseId) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * The second step (1层是录标书): detail pages pasted one after another, each
 * written with its items, files, opening and clarification deadline, under
 * the same rules as the list and the daily import. The id comes from the
 * links the copied page carries; a page pasted without them is shown but not
 * written.
 */
export async function importUruguayDetails(
  supabase: SupabaseClient | null,
  pastes: ArceDetailPaste[],
  options: { write: boolean; now?: Date; keep?: Record<string, UruguayKeepTier> },
): Promise<UruguayDetailResponse> {
  const now = options.now ?? new Date();
  const pages = pastes.flatMap((paste) => {
    const markdown = readMarkdownLinks(paste.text);
    const details = parseArceDetailPages(markdown.text);
    const id = details.length === 1 ? pasteId([...paste.links, ...markdown.links]) : undefined;
    const documents = [...paste.documents, ...markdown.documents];
    return details.map((detail) => ({ detail: detail.purchaseId || !id ? detail : { ...detail, purchaseId: id }, documents: details.length === 1 ? documents : [] }));
  });
  if (pages.length === 0) {
    throw new PasteInputError("没有找到项目详情——请在 ARCE 打开项目（Ver detalles de la compra），从页面标题开始全选整页复制，直接粘贴到这里。");
  }

  const ids = [...new Set(pages.map(({ detail }) => detail.purchaseId).filter((id): id is string => Boolean(id)))];
  const existing = supabase ? await storedSlugs(supabase, ids.map((id) => `uruguay-${id}`)) : new Set<string>();

  const rows: UruguayDetailRow[] = [];
  const toWrite: Tender[] = [];
  const links: { slug: string; links: ReturnType<typeof uruguayDocumentLinks> }[] = [];
  const seen = new Set<string>();
  for (const { detail, documents } of pages) {
    if (detail.purchaseId) {
      if (seen.has(detail.purchaseId)) continue;
      seen.add(detail.purchaseId);
    }
    const release = arceDetailToRelease(detail, documents);
    const mapped = mapArceReleaseToTender(release, now);
    const keyDates = [...mapped.keyDates];
    const opening = uruguayTime(detail.opening);
    if (opening) keyDates.push({ id: `${mapped.slug}-opening`, type: "opening", date: opening });
    const questions = uruguayTime(detail.questionsUntil);
    if (questions) keyDates.push({ id: `${mapped.slug}-questions`, type: "questions_deadline", date: questions });
    let tender: Tender = { ...mapped, keyDates };
    let outcome: UruguayPasteOutcome;
    if (!detail.purchaseId) outcome = "no_id";
    else if (isArceSaleOrLease(detail) || !isIngestedArceTender(release)) outcome = "excluded";
    else if (existing.has(mapped.slug)) outcome = "exists";
    else outcome = outcomeOf(tender, now);
    const keepTier = detail.purchaseId ? options.keep?.[detail.purchaseId] : undefined;
    if (outcome === "excluded" && keepTier && URUGUAY_KEEP_TIERS.includes(keepTier)) {
      tender = { ...tender, relevance: { tier: keepTier, label: RELEVANCE_TIER_LABELS[keepTier], reason: MANUAL_REASON }, relevanceManuallyOverridden: true };
      outcome = "manual_keep";
    }
    if (outcome === "write" || outcome === "short_window" || outcome === "manual_keep") {
      toWrite.push(tender);
      const docLinks = uruguayDocumentLinks(release);
      if (docLinks.length > 0) links.push({ slug: tender.slug, links: docLinks });
    }
    const outOfReach = outcome === "excluded" && (isArceSaleOrLease(detail) || !isIngestedArceTender(release));
    rows.push({
      procedureNumber: detail.procedureNumber,
      ...(detail.purchaseId ? { purchaseId: detail.purchaseId, url: tender.sourceUrl } : {}),
      title: tender.title.es,
      buyer: tender.buyer,
      publicationDate: tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      tier: tender.relevance.tier,
      reasonZh: outOfReach ? (isArceSaleOrLease(detail) ? "政府资产出售/出租，不是采购。" : "不在乌拉圭的读取范围内（只读公开招标和重点国企、交通部的简易招标）。") : tender.relevance.reason.zh,
      ruleTier: mapped.relevance.tier,
      outcome,
      outcomeZh: OUTCOME_ZH[outcome],
      ...(outcome === "exists" ? { existingSlug: mapped.slug } : {}),
      items: detail.items.length,
      documents: documents.length,
      keyDates: keyDates.length,
    });
  }

  if (!options.write) return { rows };
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await upsertTendersBatched(supabase, toWrite, undefined, { allowShortBidWindow: true });
  const saved = links.length > 0 ? await saveDocumentLinks(supabase, links) : null;
  return { rows, written: written.upsertedCount, failed: written.failed, documentLinks: saved?.linkCount ?? 0 };
}
