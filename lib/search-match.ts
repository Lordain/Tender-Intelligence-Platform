/**
 * How a typed keyword matches a tender's text — shared by /tenders, saved-
 * search alert emails and the admin lists.
 *
 * Until 2026-10-10 every search box matched the whole query, lowercased, as
 * ONE substring. `npm run audit:search` measured it against the live table
 * (user, 2026-10-10: 我用你写的关键词搜索都搜不到 / 反复测试我们的搜索功能):
 * two words with a space found the tender they came from 0% of the time,
 * "AMBA 电力" 2%, an unaccented "educacion" 5%, a tender number without its
 * dashes 0%. Decided the same day (A+B，邮件提醒一起改):
 *
 *   - the query is split on spaces (and commas); every word must appear,
 *     in any order, anywhere in the text;
 *   - accents, full-width forms, case and punctuation are folded away, so
 *     "bogota" finds Bogotá and "（第二标段）" finds 第二标段;
 *   - a word is also matched with every separator removed on both sides, so
 *     LPN-001/2026, "lpn 001 2026" and "lpn0012026" find one another;
 *   - a word from SEARCH_SYNONYMS also matches any other wording on its line.
 *
 * Which text a viewer's search may look at is decided elsewhere
 * (tenderSearchText's "public" vs "full"); this only decides how a query
 * matches whatever text it is given.
 */

/**
 * Same thing, different words. Kept short on purpose — every line widens
 * every search that uses one of its words. From the 2026-10-10 audit, where
 * one wording missed most of the rows the other found (光伏 20 vs 太阳能 10,
 * 供水 40 vs 饮用水 14, 输电 9 vs 输变电 0).
 */
export const SEARCH_SYNONYMS: readonly (readonly string[])[] = [
  ["光伏", "太阳能"],
  ["供水", "饮用水"],
  ["输电", "输变电"],
  ["风电", "风力发电"],
  ["智能交通", "ITS"],
  ["快速公交", "BRT"],
  ["电动公交", "电动巴士", "电动客车"],
];

export type FoldedText = { spaced: string; compact: string };

// NFKC: full-width ＡＢＣ１２３ and （） become ASCII. NFD + the combining
// range: á → a, ç → c, ñ → n. Han characters pass through untouched.
const fold = (text: string) => text.normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const toSpaced = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const toCompact = (text: string) => toSpaced(text).replace(/ /g, "");

/**
 * Folded text, kept across requests: the list is rebuilt from the cache on
 * every request, but a row's text rarely changes, and folding all of it is
 * most of a search's cost (~70 ms for the table, against ~5 ms to look it up).
 * Keyed by the text itself, so an edited row simply misses and refolds.
 */
const foldedCache = new Map<string, FoldedText>();
const FOLDED_CACHE_LIMIT = 4000; // two scopes × the whole table, with room to spare

/** Fold a tender's searchable text once; reuse it for every query. */
export function foldSearchText(text: string): FoldedText {
  const cached = foldedCache.get(text);
  if (cached) return cached;
  const spaced = toSpaced(text);
  const folded = { spaced: ` ${spaced} `, compact: spaced.replace(/ /g, "") };
  if (foldedCache.size >= FOLDED_CACHE_LIMIT) foldedCache.clear();
  foldedCache.set(text, folded);
  return folded;
}

type Term = { spaced: string; compact: string; wholeWord?: RegExp };

function term(word: string, wholeWord: boolean): Term | null {
  const spaced = toSpaced(word);
  const compact = toCompact(word);
  if (!spaced && !compact) return null;
  // A Latin synonym the viewer did not type ("ITS" for 智能交通) must stand
  // alone — not inside "kits" or "circuits". Chinese text around it counts as
  // a boundary: "ITS配套设备".
  return { spaced, compact, wholeWord: wholeWord && /^[a-z0-9]+$/.test(compact) ? new RegExp(`(?<![a-z0-9])${compact}(?![a-z0-9])`) : undefined };
}

function termMatches(text: FoldedText, candidate: Term): boolean {
  if (candidate.wholeWord) return candidate.wholeWord.test(text.spaced);
  return (candidate.spaced !== "" && text.spaced.includes(candidate.spaced)) || (candidate.compact !== "" && text.compact.includes(candidate.compact));
}

const synonymLines = SEARCH_SYNONYMS.map((line) => ({ keys: new Set(line.map(toCompact)), words: line }));

/**
 * Compile a query once into a predicate over folded text. null means the
 * query has nothing to search for (blank) — callers treat that as "no
 * keyword filter".
 */
export function compileSearchQuery(query: string | null | undefined): ((text: FoldedText) => boolean) | null {
  const words = (query ?? "").split(/[\s,，、;；]+/u).filter(Boolean);
  const groups: Term[][] = [];
  for (const word of words) {
    const typed = term(word, false);
    if (!typed) continue;
    const line = synonymLines.find((candidate) => candidate.keys.has(typed.compact));
    const alternatives = line ? line.words.filter((other) => toCompact(other) !== typed.compact).map((other) => term(other, true)) : [];
    groups.push([typed, ...alternatives.filter((alternative): alternative is Term => alternative !== null)]);
  }
  if (groups.length === 0) return null;
  return (text) => groups.every((group) => group.some((candidate) => termMatches(text, candidate)));
}
