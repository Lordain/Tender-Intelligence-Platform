/**
 * Strip accents before matching a keyword pattern against it.
 *
 * ## The bug this exists for
 *
 * JavaScript's `\b` is ASCII-only: `\w` is `[A-Za-z0-9_]`, so every accented
 * letter counts as a NON-word character and `\b` fires in the MIDDLE of a
 * word. `/\br[íi]o\b/` therefore matches the "rio" inside "Território",
 * because the "ó" in front of it reads as a word boundary.
 *
 * Found 2026-09-18 on a real row: EMBRATUR's corporate-communications and
 * public-relations tender came back tagged 水工程 (water). The tag was the
 * only visible symptom; nothing failed. In Portuguese this is not an edge
 * case — EVERY word ending in -ário or -ório matches that one pattern:
 * relatório, escritório, laboratório, mobiliário, necessário, horário,
 * orçamentário. And the same applies to all 573 `\b` uses across
 * lib/industry.ts, lib/relevance.ts and lib/relevance-pt.ts, against any
 * accented Spanish or Portuguese word.
 *
 * ## Why folding, rather than Unicode-aware boundaries
 *
 * Rewriting every `\b` into `(?<![\p{L}\p{N}_])`-style lookarounds would also
 * work, and would be 44 declarations of invasive change. Folding is one
 * function at six call sites, and it works because of something that was
 * already true: all 399 regex literals in those three files are written with
 * the unaccented form beside the accented one — `[áa]`, `[çc]`, `[ñn]`,
 * `[íi]` — so every one of them already matches folded text. Verified by
 * scanning them; `npm run test:text-fold` keeps it verified, because the day
 * someone writes a bare `é` in a pattern is the day this silently stops
 * matching that pattern's own rows.
 *
 * ## What it changes
 *
 * Both directions, and both are corrections:
 *   - a pattern no longer fires inside an accented word (Território → water);
 *   - a pattern anchored `\b` in FRONT of an accented letter now fires where
 *     it never could before (`/\b[óo]leo\b/` against a title starting "ÓLEO").
 *
 * ## Where it must NOT be used
 *
 * Anything stored or displayed. This is a matching-time transform: folding a
 * title on the way into Supabase would rewrite São Paulo as Sao Paulo for
 * every reader. Every call site is an argument to `.test()` or to a
 * classifier, never an assignment to a field.
 */
export function foldAccents(text: string): string {
  // NFD splits "ó" into "o" + U+0301; dropping the U+0300–U+036F range leaves
  // the base letter. Covers every accent Spanish and Portuguese use, ç and ñ
  // included (they decompose the same way), without a per-character table.
  // NFC at the end, not just NFD-and-strip: NFD also decomposes Hangul
  // syllables into jamo, which carry no combining marks and so would
  // survive the strip in decomposed form — a string that renders
  // identically and compares unequal. Latin text is unaffected by the
  // recomposition, its marks already being gone.
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
}
