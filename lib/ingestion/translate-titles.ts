import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";

/**
 * Title/summary translation (es -> zh) for already-ingested tenders.
 * Every mapper currently writes untranslated() (lib/ingestion/text-utils.ts
 * — {es, en: es, zh: es}, a mirror, not a real translation), which is why
 * TenderCard.tsx/TenderOverview.tsx's "Chinese leads when a real
 * translation exists" branch has had nothing to show yet — this is what
 * actually produces one.
 *
 * NO LONGER THE LIVE PATH: translate-all-tenders.ts moved to
 * Qwen3.6-Plus (translate-titles-qwen.ts) on 2026-09-08. This module
 * still owns the shared TenderToTranslate/TranslatedTender types that
 * file imports, and scripts/compare-translation-providers.ts still calls
 * it, so it is kept rather than deleted.
 *
 * Runs on Haiku 4.5, not Opus 5 (extract-requirements.ts's model) — an
 * explicit user decision, not a default: translating a title/summary is a
 * mechanical task, not the long-document comprehension work Layer 2
 * extraction does, so the cheap/fast tier is the right fit. Haiku 4.5 is
 * an older-generation model in Anthropic's current lineup — it does NOT
 * support `thinking` or `output_config.effort` (both are Opus/Sonnet-5-
 * tier-and-newer features); deliberately omitted below, not forgotten.
 *
 * en is never a target locale for this Chinese-only product (lib/i18n.tsx)
 * — only title.zh/summary.zh get a real translation; en stays mirrored
 * from es, same convention extract-requirements.ts already uses.
 *
 * No prompt caching here (unlike extract-requirements.ts): that file's
 * system prompt is long enough to clear the minimum cacheable-prefix
 * threshold and is genuinely reused across many real documents; this
 * file's system prompt is short — likely under that threshold — and the
 * actual request content (the batch of items to translate) is different,
 * volatile data on every call. Adding `cache_control` here would silently
 * do nothing rather than save anything, so it's left out rather than
 * cargo-culted from that file.
 *
 * NOT LIVE-TESTED. This environment has no ANTHROPIC_API_KEY — the
 * request shape (`client.messages.parse` + `zodOutputFormat`) is copied
 * from the current Anthropic TypeScript SDK documentation, not guessed,
 * but only checked as far as `tsc`/lint compiling the request shape — not
 * a real response. Run `npm run translate:tenders` against a real batch
 * once a key is configured to confirm translation quality before trusting
 * it at scale.
 */

const TranslatedItemSchema = z.object({
  slug: z.string().describe("Echo the input slug exactly, so the output can be matched back to the right tender without relying on array order."),
  titleZh: z.string().describe("Real, natural Chinese translation of titleEs — not a placeholder, not a transliteration."),
  summaryZh: z.string().describe("Real, natural Chinese translation of summaryEs."),
});

const BatchTranslationSchema = z.object({
  items: z.array(TranslatedItemSchema),
});

export type TenderToTranslate = { slug: string; titleEs: string; summaryEs: string; titleIsTruncated?: boolean };

/**
 * Reference codes in the Spanish that did not survive into the Chinese.
 *
 * "OP088.- REHABILITACIÓN DE RED DE DISTRIBUCIÓN ELECTRICA" came back as
 * 中低压配电网改造 — fluent, accurate, and missing the works-order number a
 * bidder uses to find the procurement on the portal. The loss is invisible in
 * review because what remains reads perfectly well.
 *
 * An identifier here is a token carrying both a digit and a letter (OP088,
 * TG-5, DCMC58, BPIN20241301010259) or a chainage (K5+500, 6+512). Bare
 * numbers are excluded: quantities, years and counts are ordinary words that
 * a translation may legitimately render differently, and flagging them would
 * bury the real thing.
 *
 * Reports rather than repairs. Where the code belongs in a Chinese sentence
 * depends on the sentence, and a wrong insertion is harder to spot than an
 * absence that has been named.
 */
export function findDroppedIdentifiers(zh: string, sourceEs: string): string[] {
  const CHAINAGE = /^\d+\+\d+$/;
  const hasDigit = /\d/;
  const hasLetter = /[A-Za-z]/;

  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const raw of sourceEs.split(/[\s,;:()[\]"'«»]+/)) {
    // Trailing sentence punctuation is not part of the code; an inner hyphen
    // or plus sign is.
    const token = raw.replace(/^[.\-]+/, "").replace(/[.\-]+$/, "");
    if (token.length < 3) continue;
    if (!hasDigit.test(token)) continue;
    if (!hasLetter.test(token) && !CHAINAGE.test(token)) continue;
    if (seen.has(token.toLowerCase())) continue;
    seen.add(token.toLowerCase());
    if (!zh.toLowerCase().includes(token.toLowerCase())) dropped.push(token);
  }

  return dropped;
}

/**
 * Drop any （original）whose contents are not actually in the Spanish.
 *
 * The parenthesis after a transliterated name exists to be searched for — on
 * a map, in the bid documents. That makes a misspelt one worse than none at
 * all: CATACAOS came back as 卡塔考斯（Catacos）, which matches no document
 * and no map while reading as authoritative. A model asked to copy a string
 * exactly will mostly do it, and "mostly" is not a property this field can
 * be built on, so the copy is verified rather than trusted.
 *
 * Matching ignores case and accents, because normalising them is legitimate:
 * sources shout in caps and strip diacritics, so RIO MEZCALAPA earning
 * （Río Mezcalapa）is correct work, not invention. Dropping a letter is not.
 *
 * Only Latin-script contents are examined. A parenthetical holding Chinese,
 * digits or punctuation is something else — an explanatory aside, a phase
 * number — and none of this applies to it.
 */
export function stripUnverifiedParentheticals(zh: string, sourceEs: string): string {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const haystack = normalize(sourceEs);

  return zh.replace(/（([^（）]+)）/g, (whole, inner: string) => {
    if (!/[A-Za-z\u00C0-\u024F]/.test(inner)) return whole;
    // Anything with CJK in it is commentary, not a copied name.
    if (/[\u4e00-\u9fff]/.test(inner)) return whole;
    return haystack.includes(normalize(inner)) ? whole : "";
  });
}

/**
 * Did the source cut this title off, leaving the whole sentence only in the
 * summary?
 *
 * SECOP truncates nombre_del_procedimiento and marks the cut with an
 * ellipsis while publishing the complete text as the description. Translating
 * the fragment yields a title that names nothing: "以单价和耗尽金额执行研究和
 * 设计更新、补充及调整，以及施工和/或……" has no place, no asset and no scope in
 * it — and the homepage column headed 中文项目名称 is exactly where it lands.
 *
 * Requires the summary to be both longer and not itself truncated, so a row
 * whose two fields are equally cut is left alone rather than rewritten from
 * something no better.
 */
export function titleIsTruncated(titleEs: string, summaryEs: string): boolean {
  const title = titleEs.trimEnd();
  const summary = summaryEs.trimEnd();

  // Whatever replaces the title has to be better than the title. A summary
  // that is itself cut, or no longer, is not.
  if (summary.endsWith("…") || summary.endsWith("...")) return false;
  if (summary.length <= title.length) return false;

  if (title.endsWith("…") || title.endsWith("...")) return true;

  // Not every source leaves an ellipsis. SECOP also hands back titles cut
  // mid-phrase — "…ESTO EN ATENCIÓN AL CON", "…DEL MUNICIPIO DE" — where the
  // only evidence is the last word. A Spanish noun phrase does not end on a
  // preposition, article or conjunction, so one of those in final position
  // means the sentence was still going.
  //
  // Deliberately not a length heuristic: Compras MX cuts at about eighty
  // characters too ("DE 144 C", "TREN DE PASAJER"), but publishes the same
  // cut text as the summary, so there is nothing to recover and the length
  // test above already declines those. Guessing from length alone would
  // rewrite titles that are merely short.
  const DANGLING = new Set([
    "de", "del", "el", "la", "los", "las", "un", "una",
    "en", "a", "al", "y", "o", "u", "e",
    "para", "con", "por", "que", "sobre", "entre", "desde", "hasta", "sin",
  ]);
  const lastWord = title.split(/[\s]+/).pop()?.toLowerCase().replace(/[.,;:]+$/, "") ?? "";
  return DANGLING.has(lastWord);
}
export type TranslatedTender = { slug: string; titleZh: string; summaryZh: string };

const SYSTEM_PROMPT = `You translate Mexican/Latin American government tender titles and summaries from Spanish to Chinese, for a platform that helps Chinese enterprises evaluate real bidding opportunities.

Ground rules:
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured, not read a stilted word-for-word rendering.
- Keep proper nouns (agency names, place names, standard/law citations) recognizable — transliterate, or keep the Spanish acronym, where a standard Chinese equivalent doesn't exist (e.g. "PEMEX" stays "PEMEX", not translated).
- Preserve technical terms precisely — this is used to help a company decide whether to bid, so a mistranslated quantity, material, or scope is a real error, not a stylistic one.
- Return exactly one output item per input item, matched back by the echoed slug (order doesn't need to match the input).`;

export async function translateTenderBatch(items: TenderToTranslate[]): Promise<TranslatedTender[]> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          items.map((i) => ({ slug: i.slug, titleEs: sanitizeForApi(i.titleEs), summaryEs: sanitizeForApi(i.summaryEs) })),
        ),
      },
    ],
    output_config: { format: zodOutputFormat(BatchTranslationSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Translation batch failed to parse (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output.items;
}
