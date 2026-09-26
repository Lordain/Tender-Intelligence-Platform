import type { SupabaseClient } from "@supabase/supabase-js";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";

/**
 * 中标结果 — the three facts a reader wants once a tender reads 已中标:
 * 中标日期, 中标供应商, 中标金额 (user, 2026-09-26: 只要三个信息(中标日期、
 * 中标供应商，中标金额(如果是范围，取最大值))).
 *
 * The columns already exist (award_date 0001, awarded_to 0006, awarded_value
 * 0019), so this is a writer, not a schema change. Each country's source
 * hands it what it observed (award-sources.ts); this decides what may be
 * written.
 *
 * Which rows: stored status "awarded" with at least one of the three empty
 * (or an award date that may still be the planned one). The status refresh
 * runs first and decides whether a tender IS awarded — this never changes a
 * status, so the award block and the 已中标 tag cannot disagree.
 *
 * What it refuses:
 *   - a column an admin edited by hand (manual_field_overrides), always;
 *   - replacing a supplier or an amount already stored. Absence of data is
 *     not data, and a second opinion is not a correction either;
 *   - an award date in the future. That is a scheduled fallo, not a result;
 *   - an amount in a currency other than the tender's own. The page prints
 *     awarded_value in tenders.currency, so a USD award on a PEN tender would
 *     be shown as soles. Counted and reported, not converted.
 *
 * The one thing it does replace: award_date. Imports and the cronograma paste
 * tool store the PLANNED 结果公示 date there, and the user's rule (2026-09-12)
 * is 有的交标、中标日期的话，以实际日期为准 — the actual date wins.
 */

/** What a source says about one tender's award. Every field optional: OxI publishes no winner, for one. */
export type AwardObservation = {
  slug: string;
  awardDate?: string;
  suppliers: string[];
  amount?: number;
  currency?: string;
};

/** One award line (a contract, a lot, an item result) before it is folded into an observation. */
export type AwardPart = { date?: string | null; supplier?: string | null; amount?: number | null; currency?: string | null };

export type AwardFill = {
  slug: string;
  title: string;
  awardDate?: string;
  awardedTo?: string;
  awardedValue?: number;
  currency?: string;
};

export type AwardRefreshResult = {
  /** Stored awarded tenders from this source still missing something. */
  candidates: number;
  /** Of those, how many the source said anything about. */
  observedCount: number;
  filled: AwardFill[];
  /** A column an admin set by hand; left alone. */
  protectedSlugs: string[];
  /** Amount in another currency than the tender's; not written. */
  currencyMismatch: string[];
  write: boolean;
  failed?: string;
  notes?: string[];
};

export type AwardCandidate = {
  id: string;
  slug: string;
  tender_number: string;
  title: { zh?: string; es?: string } | null;
  publication_date: string | null;
  submission_deadline: string | null;
  award_date: string | null;
  awarded_to: string | null;
  awarded_value: number | null;
  estimated_value: number | null;
  currency: string | null;
  source_url: string | null;
  manual_field_overrides: string[] | null;
};

const CANDIDATE_COLUMNS =
  "id, slug, tender_number, title, publication_date, submission_deadline, award_date, awarded_to, awarded_value, estimated_value, currency, source_url, manual_field_overrides";

const MAX_SUPPLIER_NAMES = 3;

/**
 * How far back a tender is still worth asking about. A tender whose winner
 * or amount the source never publishes (OxI names no company; some fallos
 * never get a contract) stays a candidate forever, and every candidate is a
 * request a day. A year after publication, anything the source was going to
 * publish has been published.
 */
const CANDIDATE_MAX_AGE_DAYS = 365;

/**
 * Awarded tenders of these sources that a refresh could still add to.
 *
 * A row with all three filled is done, and re-asking the source about it
 * every day would cost a request per tender forever for nothing; so is one
 * published more than CANDIDATE_MAX_AGE_DAYS ago.
 */
export async function listAwardCandidates(
  supabase: SupabaseClient,
  filter: { sourceNames?: string[]; slugPrefix?: string },
): Promise<AwardCandidate[]> {
  const rows: AwardCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("tenders")
      .select(CANDIDATE_COLUMNS)
      .eq("status", "awarded")
      .or("award_date.is.null,awarded_to.is.null,awarded_value.is.null")
      .gte("publication_date", new Date(Date.now() - CANDIDATE_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10));
    if (filter.sourceNames) query = query.in("source_name", filter.sourceNames);
    if (filter.slugPrefix) query = query.like("slug", `${filter.slugPrefix}%`);
    const { data, error } = await query.order("slug", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`读取已中标项目失败：${error.message}`);
    rows.push(...((data ?? []) as AwardCandidate[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** "2026-07-09T17:55:20Z" / "2026-07-09" / "09/07/2026" → "2026-07-09"; null for anything else. */
export function awardDay(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1];
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function cleanSupplier(name: string | null | undefined): string | null {
  const value = (name ?? "").replace(/\s+/g, " ").trim();
  if (!value || /^no definido$/i.test(value)) return null;
  return value;
}

/**
 * Several award lines into one observation: every distinct winner, the
 * latest award date, and the amounts summed.
 *
 * Summed, because a tender split into lots or items awarded to different
 * suppliers was awarded for all of them together. The 取最大值 part of the
 * request — an award published as a range — is resolved by each source
 * before it gets here (Compras MX's contrato abierto maximum, for one).
 * Mixed currencies leave the amount out rather than add pesos to dollars.
 */
export function combineAwardParts(slug: string, parts: AwardPart[]): AwardObservation {
  const suppliers: string[] = [];
  const seen = new Set<string>();
  let awardDate: string | undefined;
  let amount = 0;
  let amountSeen = false;
  const currencies = new Set<string>();
  for (const part of parts) {
    const supplier = cleanSupplier(part.supplier);
    if (supplier && !seen.has(supplier.toUpperCase())) {
      seen.add(supplier.toUpperCase());
      suppliers.push(supplier);
    }
    const day = awardDay(part.date);
    if (day && (!awardDate || day > awardDate)) awardDate = day;
    if (typeof part.amount === "number" && Number.isFinite(part.amount) && part.amount > 0) {
      amount += part.amount;
      amountSeen = true;
      if (part.currency) currencies.add(part.currency.toUpperCase());
    }
  }
  const currency = currencies.size === 1 ? [...currencies][0] : undefined;
  return {
    slug,
    awardDate,
    suppliers,
    amount: amountSeen && currencies.size <= 1 ? Math.round(amount * 100) / 100 : undefined,
    currency,
  };
}

/** "A；B；C 等 5 家" — what awarded_to holds when a tender had several winners. */
export function formatSuppliers(suppliers: string[]): string | undefined {
  if (suppliers.length === 0) return undefined;
  const shown = suppliers.slice(0, MAX_SUPPLIER_NAMES).join("；");
  return suppliers.length > MAX_SUPPLIER_NAMES ? `${shown} 等 ${suppliers.length} 家` : shown;
}

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function writeAwardResults(
  supabase: SupabaseClient,
  candidates: AwardCandidate[],
  observations: AwardObservation[],
  options: { write: boolean; now?: Date },
): Promise<AwardRefreshResult> {
  const result: AwardRefreshResult = {
    candidates: candidates.length,
    observedCount: 0,
    filled: [],
    protectedSlugs: [],
    currencyMismatch: [],
    write: options.write,
  };
  const today = todayUtc(options.now ?? new Date());
  const bySlug = new Map(observations.map((observation) => [observation.slug, observation]));

  const updates: { row: AwardCandidate; patch: Record<string, unknown>; fill: AwardFill }[] = [];
  for (const row of candidates) {
    const observed = bySlug.get(row.slug);
    if (!observed) continue;
    result.observedCount += 1;
    const locked = new Set(row.manual_field_overrides ?? []);
    const patch: Record<string, unknown> = {};
    const fill: AwardFill = { slug: row.slug, title: row.title?.zh || row.title?.es || row.slug };
    let blockedByLock = false;

    const date = observed.awardDate && observed.awardDate <= today ? observed.awardDate : undefined;
    if (date && date !== row.award_date) {
      if (locked.has("award_date")) blockedByLock = true;
      else {
        patch.award_date = date;
        fill.awardDate = date;
      }
    }

    const supplier = formatSuppliers(observed.suppliers);
    if (supplier && !row.awarded_to) {
      if (locked.has("awarded_to")) blockedByLock = true;
      else {
        patch.awarded_to = supplier;
        fill.awardedTo = supplier;
      }
    }

    if (observed.amount !== undefined && row.awarded_value === null) {
      const storedCurrency = row.currency?.toUpperCase() ?? null;
      const awardCurrency = observed.currency?.toUpperCase() ?? storedCurrency;
      if (locked.has("awarded_value")) blockedByLock = true;
      else if (storedCurrency && awardCurrency && storedCurrency !== awardCurrency) {
        result.currencyMismatch.push(`${row.slug}（${awardCurrency} ≠ ${storedCurrency}）`);
      } else if (!storedCurrency && !awardCurrency) {
        result.currencyMismatch.push(`${row.slug}（币种不明）`);
      } else {
        patch.awarded_value = observed.amount;
        fill.awardedValue = observed.amount;
        // A tender stored without a currency has no estimated value to be
        // mis-labelled by setting one; the award amount needs it to print.
        if (!storedCurrency && awardCurrency && row.estimated_value === null && !locked.has("currency")) {
          patch.currency = awardCurrency;
          fill.currency = awardCurrency;
        }
      }
    }

    if (blockedByLock && Object.keys(patch).length === 0) result.protectedSlugs.push(row.slug);
    if (Object.keys(patch).length === 0) continue;
    result.filled.push(fill);
    updates.push({ row, patch, fill });
  }

  if (!options.write) return result;

  const updatedAt = (options.now ?? new Date()).toISOString();
  for (const { row, patch } of updates) {
    const { error } = await supabase.from("tenders").update({ ...patch, updated_at: updatedAt }).eq("id", row.id);
    if (error) return { ...result, failed: `写入中标结果失败（${row.slug}）：${error.message}` };
    // The 关键日期 timeline mirrors award_date; all three synced columns are
    // passed because the sync clears the mirrors of every type it owns.
    if (patch.award_date) {
      await syncKeyDatesForTopLevelFields(supabase, row.id, {
        publicationDate: row.publication_date,
        submissionDeadline: row.submission_deadline,
        awardDate: patch.award_date as string,
      });
    }
  }
  return result;
}

/** One line per fill, for a cron log. */
export function describeAwardRefresh(result: AwardRefreshResult): string[] {
  const lines = [
    `已中标但缺中标信息的项目 ${result.candidates} 条，来源有记录 ${result.observedCount} 条；补上 ${result.filled.length} 条${result.write ? "（已写入）" : "（试运行，未写入）"}。`,
  ];
  for (const fill of result.filled.slice(0, 30)) {
    const parts = [
      fill.awardDate && `日期 ${fill.awardDate}`,
      fill.awardedTo && `供应商 ${fill.awardedTo}`,
      fill.awardedValue !== undefined && `金额 ${fill.awardedValue.toLocaleString("en-US")}${fill.currency ? ` ${fill.currency}` : ""}`,
    ].filter(Boolean);
    lines.push(`  ${fill.slug}  ${parts.join("，")}`);
  }
  if (result.filled.length > 30) lines.push(`  …以及另外 ${result.filled.length - 30} 条`);
  if (result.protectedSlugs.length > 0) lines.push(`  人工改过中标信息、未动：${result.protectedSlugs.slice(0, 10).join("，")}`);
  if (result.currencyMismatch.length > 0) lines.push(`  金额币种与项目不一致、未写金额：${result.currencyMismatch.slice(0, 10).join("，")}`);
  for (const note of result.notes ?? []) lines.push(`  ${note}`);
  if (result.failed) lines.push(`  ⚠ ${result.failed}`);
  return lines;
}
