import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { isReadGuatemalaModality, parseGuatecomprasDetails, parseGuatecomprasList } from "@/lib/ingestion/guatemala-paste";
import { GUATEMALA, guatemalaCallFromDetail, guatemalaCallFromList, mapGuatemalaCallToTender } from "@/lib/ingestion/guatemala-mapper";
import { hasShortBidWindow, isPastSubmissionDeadline, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import {
  GUATEMALA_KEEP_TIERS,
  type GuatecomprasLink,
  type GuatemalaDetailPaste,
  type GuatemalaDetailResponse,
  type GuatemalaDetailRow,
  type GuatemalaKeepTier,
  type GuatemalaPasteOutcome,
  type GuatemalaPasteResponse,
  type GuatemalaPasteRow,
} from "@/lib/ingestion/guatemala-paste-result";

/**
 * The 危地马拉 tab's two paste steps (user, 2026-10-16: A — 两步粘贴导入).
 * Guatecompras answers our servers with a Cloudflare challenge, so the admin
 * copies its pages in their own browser:
 *
 *   1. 「Concursos vigentes」 filtered to Licitación Pública, newest first:
 *      read with the same rules, nothing written; the calls worth opening are
 *      listed with their links.
 *   2. Those calls' detail pages, one after another: written.
 *
 * Reach (rule A): Licitación Pública and calls under international
 * agreements; of those, central government, state companies and autonomous
 * bodies — a local government's call is excluded by the rules themselves
 * (lib/relevance.ts, isGuatemalaLocalGovernmentCall). No amount is published,
 * so a kept call stops at 常规 (NO_AMOUNT_MAX_STANDARD_COUNTRIES). The
 * standing rules hold as for every import (请一定要保障现在应用的筛选规则…一样
 * 适用): the passed-deadline gate and an admin's earlier delete in
 * upsertTendersBatched; as for every paste import, no 12-day window for a
 * call the admin chose by hand, and an excluded call can be kept by hand.
 *
 * Stored as guatemala-{NOG}: pasting the same call again updates it.
 */
const OUTCOME_ZH: Record<GuatemalaPasteOutcome, string> = {
  write: "会写入",
  short_window: `会写入（发布到截标不足 ${SHORT_BID_WINDOW_DAYS} 天，手动粘贴不受此限制）`,
  manual_keep: "按你的选择手动保留，会写入",
  excluded: "按平台规则排除，不写入",
  closed: "截标日已过，不写入",
  not_open: "已不在投标阶段，不写入",
  exists: "平台上已有，不重复写入",
};

const MANUAL_REASON = { zh: "管理员在后台手动设置", en: "Manually set by an admin", es: "Establecido manualmente por un administrador" };

function outcomeOf(tender: Tender, now: Date): GuatemalaPasteOutcome {
  if (isPastSubmissionDeadline(tender, now)) return "closed";
  if (tender.status !== "open") return "not_open";
  if (tender.relevance.tier === "excluded") return "excluded";
  if (hasShortBidWindow(tender)) return "short_window";
  return "write";
}

async function storedSlugs(supabase: SupabaseClient, slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const { data, error } = await supabase.from("tenders").select("slug").eq("country", GUATEMALA).in("slug", slugs);
  if (error) throw new Error(`无法核对是否已导入过：${error.message}`);
  return new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
}

function keptByHand(tender: Tender, tier: GuatemalaKeepTier): Tender {
  return { ...tender, relevance: { tier, label: RELEVANCE_TIER_LABELS[tier], reason: MANUAL_REASON }, relevanceManuallyOverridden: true };
}

function rowOf(tender: Tender, mapped: Tender, nog: string, outcome: GuatemalaPasteOutcome): GuatemalaPasteRow {
  return {
    nog,
    url: tender.sourceUrl,
    title: tender.title.es,
    buyer: tender.buyer,
    municipal: tender.governmentLevel === "municipal",
    publicationDate: tender.publicationDate,
    submissionDeadline: tender.submissionDeadline,
    tier: tender.relevance.tier,
    reasonZh: tender.relevance.reason.zh,
    ruleTier: mapped.relevance.tier,
    outcome,
    outcomeZh: OUTCOME_ZH[outcome],
    ...(outcome === "exists" ? { existingSlug: mapped.slug } : {}),
  };
}

/** Step one (1层是分析哪些项目值得录入): the list, judged by the rules. Writes nothing. */
export async function screenGuatemalaList(supabase: SupabaseClient | null, text: string, links: GuatecomprasLink[], now: Date = new Date()): Promise<GuatemalaPasteResponse> {
  const calls = parseGuatecomprasList(text);
  if (calls.length === 0) {
    throw new PasteInputError("没有找到项目——请在 Guatecompras「Concursos vigentes」点「Licitación Pública (Art. 17 LCE)」筛选后，全选整页复制，直接粘贴到这里。");
  }
  const url = new Map(links.map((link) => [link.nog, link.url]));
  const notRead = new Map<string, number>();
  const read = calls.filter((call) => {
    if (isReadGuatemalaModality(call.modality)) return true;
    notRead.set(call.modality, (notRead.get(call.modality) ?? 0) + 1);
    return false;
  });
  const existing = supabase ? await storedSlugs(supabase, read.map((call) => `guatemala-${call.nog}`)) : new Set<string>();

  const rows: GuatemalaPasteRow[] = [];
  const seen = new Set<string>();
  for (const call of read) {
    if (seen.has(call.nog)) continue;
    seen.add(call.nog);
    const tender = mapGuatemalaCallToTender(guatemalaCallFromList(call, url.get(call.nog)), now);
    rows.push(rowOf(tender, tender, call.nog, existing.has(tender.slug) ? "exists" : outcomeOf(tender, now)));
  }
  return { rows, notRead: [...notRead].map(([modality, count]) => ({ modality, count })).sort((a, b) => b.count - a.count) };
}

/** Step two (1层是录标书): detail pages, written under the same rules. */
export async function importGuatemalaDetails(
  supabase: SupabaseClient | null,
  pastes: GuatemalaDetailPaste[],
  options: { write: boolean; now?: Date; keep?: Record<string, GuatemalaKeepTier> },
): Promise<GuatemalaDetailResponse> {
  const now = options.now ?? new Date();
  const pages = pastes.flatMap((paste) => {
    const url = new Map(paste.links.map((link) => [link.nog, link.url]));
    return parseGuatecomprasDetails(paste.text).map((detail) => ({ detail, url: url.get(detail.nog) }));
  });
  if (pages.length === 0) {
    throw new PasteInputError("没有找到项目详情——请在 Guatecompras 打开项目（Detalle de concurso），全选整页复制，直接粘贴到这里。");
  }
  const existing = supabase ? await storedSlugs(supabase, pages.map(({ detail }) => `guatemala-${detail.nog}`)) : new Set<string>();

  const rows: GuatemalaDetailRow[] = [];
  const toWrite: Tender[] = [];
  const seen = new Set<string>();
  for (const { detail, url } of pages) {
    if (seen.has(detail.nog)) continue;
    seen.add(detail.nog);
    const mapped = mapGuatemalaCallToTender(guatemalaCallFromDetail(detail, url), now);
    let tender = mapped;
    let outcome: GuatemalaPasteOutcome = !isReadGuatemalaModality(detail.modality) ? "excluded" : existing.has(mapped.slug) ? "exists" : outcomeOf(mapped, now);
    const keepTier = options.keep?.[detail.nog];
    if (outcome === "excluded" && keepTier && GUATEMALA_KEEP_TIERS.includes(keepTier)) {
      tender = keptByHand(mapped, keepTier);
      outcome = "manual_keep";
    }
    if (outcome === "write" || outcome === "short_window" || outcome === "manual_keep") toWrite.push(tender);
    const row = rowOf(tender, mapped, detail.nog, outcome);
    rows.push({
      ...row,
      ...(!isReadGuatemalaModality(detail.modality) && outcome === "excluded"
        ? { tier: "excluded", reasonZh: `采购方式「${detail.modality}」不在危地马拉的读取范围内（只读公开招标和国际协定项下的采购）。` }
        : {}),
      keyDates: tender.keyDates.length,
      snip: detail.snip,
      bonds: detail.bondBidPercent || detail.bondPerformancePercent ? `投标保证金 ${detail.bondBidPercent ?? 0}%，履约保证金 ${detail.bondPerformancePercent ?? 0}%` : null,
    });
  }

  if (!options.write) return { rows };
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await upsertTendersBatched(supabase, toWrite, undefined, { allowShortBidWindow: true });
  return { rows, written: written.upsertedCount, failed: written.failed };
}
