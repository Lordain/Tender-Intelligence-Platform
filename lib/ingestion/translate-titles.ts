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

export type TenderToTranslate = { slug: string; titleEs: string; summaryEs: string };
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
