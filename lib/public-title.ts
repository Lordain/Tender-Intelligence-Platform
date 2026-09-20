import type { Tender } from "@/types/tender";

/**
 * Reading and checking the three generated display strings — the public
 * title (migration 0053), the member short title and the public summary
 * (both migration 0054).
 *
 * `title.zh` is not publishable, and that is a deliberate consequence of a
 * correct decision made elsewhere: translate-titles-qwen.ts keeps the source
 * proper noun in full-width parentheses after every transliterated place,
 * facility or project name — 马塔德罗（Matadero）泵站 — because "a
 * transliteration on its own appears in neither [the map nor the bid
 * documents]". For a subscriber that is exactly right. For everyone else it
 * is the original Spanish or Portuguese name of the project, rendered in our
 * own HTML, ready to paste into a search engine.
 *
 * So the public title is generated separately rather than derived by
 * stripping at render time. Two reasons that matters:
 *
 * - A regex over place names cannot work. There is no closed list of Latin
 *   American municipalities, districts, rivers and facilities, and a
 *   blacklist that is 90% complete leaks on exactly the 10% nobody checked.
 * - A masked title is bad copy. "████████变电站扩建工程" reads as a broken
 *   page to a visitor and as thin content to a crawler, and these pages live
 *   or die on ranking for 墨西哥 变电站 招标. A rewritten one — 墨西哥
 *   变电站扩建工程（输配电）— is a real title that happens not to identify
 *   anything.
 */

/**
 * The title to publish for this tender.
 *
 * Falls back to `title.zh` for a row the generator has not reached, which is
 * a deliberate choice about rollout rather than about safety: the fallback
 * leaves today's behaviour in place and lets the column improve pages as it
 * fills, where falling back to a generic placeholder would blank every title
 * on the site — and every <title>, meta description and JSON-LD name with
 * them — the moment this shipped.
 */
export function publicTitleOf(tender: Pick<Tender, "title" | "titleZhPublic">): string {
  const generated = tender.titleZhPublic?.trim();
  if (generated !== undefined && generated !== "") return generated;
  return tender.title.zh;
}

/**
 * Latin-script tokens a Chinese technical title may legitimately contain.
 *
 * The rule is "no Latin script", with this narrow exception, rather than a
 * list of forbidden things — the same whitelist-over-blacklist reasoning as
 * toPublicTenderDetail. A unit or an industry abbreviation is written this
 * way in Chinese engineering copy and identifies nothing; a proper noun is
 * the entire problem. Compared case-insensitively.
 */
const ALLOWED_LATIN_TOKENS: ReadonlySet<string> = new Set([
  // Electrical and power
  "kv", "mv", "v", "kw", "mw", "gw", "kwh", "mwh", "kva", "mva", "hz", "ac", "dc",
  // Dimensions and quantities
  "km", "mm", "cm", "m", "m2", "m3", "kg", "t", "l",
  // Contracting and delivery models a Chinese reader knows in Latin
  "epc", "ppp", "bot", "boo", "eps", "pmc",
  // Systems commonly written in Latin in Chinese technical prose
  "gis", "scada", "led", "gps", "bim", "it", "ict", "cctv", "lng", "lpg", "grp", "hdpe", "pvc",
  // Brazilian facility and material classes the pt translation prompt keeps
  // in Latin (translate-titles-pt.ts). Each names a KIND of thing — a water
  // treatment plant, a basic health unit, hot-mix asphalt — shared by
  // thousands of tenders, so none of them narrows anything. The two-letter
  // UF state codes are deliberately NOT here: MG and SP name one state each,
  // and a state is exactly what the public title drops.
  "eta", "ete", "ubs", "esf", "cbuq", "tsd",
]);

const LATIN_RUN = /[A-Za-z]+/g;
/** A parenthesis — either width — containing Latin script. The transliteration anchor the translation prompt adds. */
const LATIN_PARENTHETICAL = /[（(][^）)]*[A-Za-z]{2,}[^）)]*[）)]/;
/** The same shape, for stripping every occurrence rather than testing for one. */
const LATIN_PARENTHETICAL_GLOBAL = /[（(][^）)]*[A-Za-z]{2,}[^）)]*[）)]/g;
/** Chainage (K0+000, KM 6+512) and other digit+digit reference shapes. */
const CHAINAGE = /\d\s*\+\s*\d/;
/** A long digit run: procurement numbers (BPIN 20241301010259, CUI 2457630). A year or a voltage is shorter. */
const LONG_DIGIT_RUN = /\d{6,}/;

/**
 * Redaction artefacts. A model told to remove a place name sometimes marks
 * the hole instead of rewriting around it.
 *
 * Rejected because a masked title fails at the one job this column has that
 * is not about secrecy: it has to be good copy. "墨西哥 ███ 变电站扩建工程"
 * reads as a broken page to a visitor and as thin content to a crawler, and
 * these pages live or die on ranking. A title that is safe and ranks for
 * nothing is not a win — a vaguer real title (墨西哥 变电站扩建工程) is.
 */
const MASKING = /[█▓▒░]|\*{2,}|某某|[xX]{2,}|已隐藏|已屏蔽|保密处理/;

/** Longer than a title, and it is no longer a title. Real translated titles run well under this. */
const MAX_LENGTH = 60;

/**
 * Why this candidate must not be published, or an empty list if it may be.
 *
 * Returned as reasons rather than a boolean because the generator reports
 * them: a prompt that starts failing one rule on many rows is a prompt to
 * fix, and "37 rows rejected" with no reason says nothing about which.
 */
export function publicTitleProblems(candidate: string): string[] {
  const problems: string[] = [];
  const text = candidate.trim();

  if (text === "") return ["空标题"];
  if (text.length > MAX_LENGTH) problems.push(`超过 ${MAX_LENGTH} 字（${text.length} 字）`);

  if (LATIN_PARENTHETICAL.test(text)) {
    // Checked separately from the token scan below so the message names the
    // actual failure — this is the shape the translation prompt produces, so
    // it is the one to expect most often.
    problems.push("保留了括号内的原文名称");
  }

  const unexpected = [...new Set(
    (text.match(LATIN_RUN) ?? [])
      .filter((run) => !ALLOWED_LATIN_TOKENS.has(run.toLowerCase())),
  )];
  if (unexpected.length > 0) problems.push(`含有原文词：${unexpected.join("、")}`);

  if (MASKING.test(text)) problems.push("含有遮挡或占位符号");
  if (CHAINAGE.test(text)) problems.push("含有桩号或编号");
  if (LONG_DIGIT_RUN.test(text)) problems.push("含有项目编号");

  return problems;
}

/** Convenience wrapper — a candidate is publishable when it has no problems. */
export function isPublishablePublicTitle(candidate: string): boolean {
  return publicTitleProblems(candidate).length === 0;
}

/**
 * The title to show a MEMBER: the condensed form, falling back to the full
 * translated title for a row the generator has not reached.
 *
 * Falls open, and deliberately so — the opposite of publicSummaryOf below.
 * There is nothing to protect here (a member is entitled to the full title),
 * the fallback is merely more verbose, and the full title is what the site
 * shows today.
 */
export function shortTitleOf(tender: Pick<Tender, "title" | "titleZhShort">): string {
  const generated = tender.titleZhShort?.trim();
  if (generated !== undefined && generated !== "") return generated;
  return tender.title.zh;
}

/**
 * The summary to publish for this tender, or undefined when there is none.
 *
 * FAILS CLOSED, unlike publicTitleOf. A row whose summary has not been
 * generated yet returns undefined and the caller substitutes the same generic
 * sentence it already uses for an untranslated row — it does NOT fall back to
 * summary.zh.
 *
 * The asymmetry is not an inconsistency. The title is the <h1>, the <title>
 * and the JSON-LD name: a fallback that returns nothing blanks the page, so
 * title.zh is the only option and the leak it carries is a known, bounded
 * cost of the rollout. The summary block is conditional on every surface that
 * renders it, so failing closed costs a placeholder sentence — which is a
 * price worth paying, because summary.zh restates the project name, the
 * municipality and often the street, and publishing it under a redacted title
 * would undo the redaction completely.
 */
export const GENERIC_PUBLIC_SUMMARY =
  "这是一个政府采购项目，可先查看采购方式、参与范围、所属国家和计划交标时间。";

export function publicSummaryOf(tender: Pick<Tender, "summaryZhPublic">): string | undefined {
  const generated = tender.summaryZhPublic?.trim();
  return generated !== undefined && generated !== "" ? generated : undefined;
}

/**
 * A short title is measured on its Chinese prose, not on its characters.
 *
 * The full-width parenthetical is REQUIRED here — it is the anchor a member
 * matches against the bid documents — and Brazilian and Peruvian names are
 * long: 卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复 is a good
 * short title and 41 characters. Counting raw characters would reject exactly
 * the countries whose names need the anchor most, so the reference tag is
 * excluded from the readability budget and the whole string gets a separate,
 * looser ceiling so it still cannot run away.
 */
const MAX_SHORT_TITLE_PROSE = 30;
const MAX_SHORT_TITLE_LENGTH = 60;
/** Long enough to say what the works are and at what scale; short enough to survive a 155-character meta description with the country and industries appended. */
const MAX_PUBLIC_SUMMARY_LENGTH = 100;

/** Latin runs in `text` that are neither an allowed unit nor present in `source`. */
function foreignLatinRuns(text: string, source?: string): string[] {
  const haystack = source?.toLowerCase();
  return [...new Set(
    (text.match(LATIN_RUN) ?? []).filter((run) => {
      const lower = run.toLowerCase();
      if (ALLOWED_LATIN_TOKENS.has(lower)) return false;
      return haystack === undefined || !haystack.includes(lower);
    }),
  )];
}

/**
 * Why this condensed member title must not be written.
 *
 * A far looser gate than publicTitleProblems, because it is guarding
 * something different. The public title must not IDENTIFY the tender; the
 * short title is supposed to — place names and the full-width parentheses
 * are the reason a member can match it to the bid documents, so they are
 * expected here. What this checks is that the model condensed rather than
 * invented: nothing added that the full title did not say, no masking, and
 * an output that is actually shorter than its input.
 *
 * Dropping a procurement code is NOT a problem here and is not checked for.
 * It is the point — 公开招标（电子）第023/2026号 is what makes a list row
 * unreadable — and nothing is lost by it: the code stays in `tenderNumber`,
 * and the detail page still renders the full title.
 */
export function shortTitleProblems(candidate: string, fullTitleZh: string): string[] {
  const problems: string[] = [];
  const text = candidate.trim();
  const full = fullTitleZh.trim();

  if (text === "") return ["空标题"];
  const prose = text.replace(LATIN_PARENTHETICAL_GLOBAL, "");
  if (prose.length > MAX_SHORT_TITLE_PROSE) problems.push(`正文超过 ${MAX_SHORT_TITLE_PROSE} 字（${prose.length} 字，不含括号原文）`);
  if (text.length > MAX_SHORT_TITLE_LENGTH) problems.push(`整体超过 ${MAX_SHORT_TITLE_LENGTH} 字（${text.length} 字）`);
  // A "condensed" title at least as long as its input did not condense — but
  // only when the input had something to condense. 采购实验室设备 is already a
  // short title, and the correct output 实验室设备采购 is a reorder of the same
  // seven characters; rejecting that would flag the rows this pass has the
  // least to do with, and the flagged column would fall back to the very text
  // the model just agreed with. So the rule applies from the point where
  // shortening is actually being asked for.
  const fullProse = full.replace(LATIN_PARENTHETICAL_GLOBAL, "");
  if (fullProse.length > MAX_SHORT_TITLE_PROSE && text.length >= full.length) problems.push("没有变短");
  if (MASKING.test(text)) problems.push("含有遮挡或占位符号");

  // Latin script the full title did not contain is invented — a
  // transliteration guessed at, or a name imported from another row in the
  // batch. Either one publishes a different project's name under this tender.
  const invented = foreignLatinRuns(text, full);
  if (invented.length > 0) problems.push(`原标题里没有的外文词：${invented.join("、")}`);

  return problems;
}

/**
 * Why this public summary must not be published.
 *
 * The same rules as publicTitleProblems — this string goes to exactly the
 * same audience through exactly the same surfaces, and the meta description
 * it feeds is read in search results without the page ever being opened.
 *
 * One rule is NOT enforced here and is left to the prompt: exact quantities.
 * "6.93 公里" identifies a road as precisely as a budget figure does, but the
 * decimal that makes it dangerous is the same decimal that makes 34.5kV worth
 * keeping, and a validator cannot tell a fingerprint from a specification.
 * The prompt is told to round; this catches only what a regex can be sure of.
 */
export function publicSummaryProblems(candidate: string): string[] {
  const problems: string[] = [];
  const text = candidate.trim();

  if (text === "") return ["空摘要"];
  if (text.length > MAX_PUBLIC_SUMMARY_LENGTH) problems.push(`超过 ${MAX_PUBLIC_SUMMARY_LENGTH} 字（${text.length} 字）`);
  if (LATIN_PARENTHETICAL.test(text)) problems.push("保留了括号内的原文名称");

  const unexpected = foreignLatinRuns(text);
  if (unexpected.length > 0) problems.push(`含有原文词：${unexpected.join("、")}`);

  if (MASKING.test(text)) problems.push("含有遮挡或占位符号");
  if (CHAINAGE.test(text)) problems.push("含有桩号或编号");
  if (LONG_DIGIT_RUN.test(text)) problems.push("含有项目编号");

  return problems;
}
