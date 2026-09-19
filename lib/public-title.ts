import type { Tender } from "@/types/tender";

/**
 * Reading and checking the de-identified public title (migration 0053).
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
