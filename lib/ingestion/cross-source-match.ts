/**
 * Is a World Bank notice a call the platform already holds from the
 * country's own system? (User, 2026-10-09: 写入世界银行项目之前，先和库里同一
 * 国家的项目比对：采购方、交标截止日、标题相似度都对上，就判定为同一项目.)
 *
 * The national systems number a call their own way, so the World Bank's STEP
 * reference is only sometimes there to match on. When it is not, the call is
 * matched on what both sources state: the bid deadline's day, the buyer and
 * the title. Pure, so the comparison report (scripts/compare-worldbank-
 * duplicates.ts) and a later import use the same rule.
 *
 *   reference  the STEP reference appears in the stored row's number, title or summary
 *   strong     deadline within a day, and the titles share most of their words
 *   weak       the titles share most of their words, or deadline and buyer agree — for a person to look at
 */

export type MatchCandidate = {
  slug: string;
  tenderNumber: string | null;
  title: string;
  summary: string;
  buyer: string;
  submissionDeadline: string | null;
  sourceName: string | null;
};

export type MatchKind = "reference" | "strong" | "weak";

export type CrossSourceMatch = {
  kind: MatchKind;
  candidate: MatchCandidate;
  titleOverlap: number;
  buyerOverlap: number;
  deadlineDays: number | null;
};

const STOPWORDS = new Set(
  "de del la las el los y e en para por con a al o u un una sus su que se lo como sin sobre the of and for to in on at by an or das dos da do na no em com ao aos as os".split(" "),
);

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Words of three letters and more, accents and case folded, common words left out. */
export function words(text: string): Set<string> {
  return new Set(fold(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word)));
}

/** Shared words over the shorter text's words: 1 when one title is contained in the other. */
export function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function compact(text: string): string {
  return fold(text).replace(/[^a-z0-9]/g, "");
}

function dayGap(a: string | null | undefined, b: string | null | undefined): number | null {
  const left = Date.parse(a ?? "");
  const right = Date.parse(b ?? "");
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(left - right) / 86_400_000;
}

/** The best match for a notice among the stored rows of its country, or undefined. */
export function findCrossSourceMatch(
  notice: { reference?: string; title: string; buyer: string; submissionDeadline?: string },
  candidates: MatchCandidate[],
): CrossSourceMatch | undefined {
  const reference = notice.reference ? compact(notice.reference) : undefined;
  let best: CrossSourceMatch | undefined;
  const rank: Record<MatchKind, number> = { reference: 3, strong: 2, weak: 1 };

  for (const candidate of candidates) {
    const titleOverlap = overlap(notice.title, candidate.title);
    const buyerOverlap = overlap(notice.buyer, candidate.buyer);
    const deadlineDays = dayGap(notice.submissionDeadline, candidate.submissionDeadline);
    const sameDeadline = deadlineDays !== null && deadlineDays <= 1;

    let kind: MatchKind | undefined;
    if (reference && compact(`${candidate.tenderNumber ?? ""} ${candidate.title} ${candidate.summary}`).includes(reference)) kind = "reference";
    else if (sameDeadline && titleOverlap >= 0.5) kind = "strong";
    else if (titleOverlap >= 0.6 || (sameDeadline && buyerOverlap >= 0.5)) kind = "weak";
    if (!kind) continue;

    const match: CrossSourceMatch = { kind, candidate, titleOverlap, buyerOverlap, deadlineDays };
    if (!best || rank[kind] > rank[best.kind] || (rank[kind] === rank[best.kind] && titleOverlap > best.titleOverlap)) best = match;
  }
  return best;
}
