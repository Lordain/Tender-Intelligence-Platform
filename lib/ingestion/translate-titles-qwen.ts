import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";
import type { TenderToTranslate, TranslatedTender } from "@/lib/ingestion/translate-titles";

/**
 * Cost-comparison alternative to translate-titles.ts's Claude Haiku 4.5
 * path (2026-09-03, per the user's explicit request to evaluate cheaper
 * providers for translation before committing to one). Same
 * input/output shape as translateTenderBatch() so
 * scripts/compare-translation-providers.ts can call all three
 * providers interchangeably.
 *
 * Qwen3.6-Plus via Alibaba Cloud DashScope's OpenAI-compatible endpoint —
 * confirmed real (WebSearch, 2026-09-03, since this model postdates
 * training data): model id `qwen3.6-plus`, base URL
 * `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, standard
 * `openai` npm SDK pointed at that base URL and a DASHSCOPE_API_KEY
 * instead of an OpenAI key. Structured output uses the OpenAI-compatible
 * `response_format: { type: "json_object" }` (JSON mode) rather than a
 * full JSON-schema/strict mode — DashScope's exact structured-output
 * feature parity with Qwen3.6-Plus specifically (a general chat model,
 * not a "-vl"/document variant) wasn't independently confirmed, so this
 * sticks to the widely-supported JSON-mode + manual zod validation
 * pattern instead of assuming schema-level enforcement exists.
 *
 * NOT LIVE-TESTED — no DASHSCOPE_API_KEY is configured yet (2026-09-03).
 * Request/response shape is grounded in real, current (2026) documentation
 * fetched via WebSearch, not guessed from training-data memory of the
 * (non-OpenAI-compatible) DashScope SDK. Run
 * `npm run compare:translation` once a key is added to confirm this
 * actually works before trusting it at scale.
 */

const TranslatedItemSchema = z.object({
  slug: z.string(),
  titleZh: z.string(),
  summaryZh: z.string(),
});

const BatchTranslationSchema = z.object({
  items: z.array(TranslatedItemSchema),
});

const SYSTEM_PROMPT = `You translate Mexican/Latin American government tender titles and summaries from Spanish to Chinese, for a platform that helps Chinese enterprises evaluate real bidding opportunities.

Ground rules:
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured, not read a stilted word-for-word rendering.
- Keep proper nouns (agency names, place names, standard/law citations) recognizable — transliterate, or keep the Spanish acronym, where a standard Chinese equivalent doesn't exist (e.g. "PEMEX" stays "PEMEX", not translated).
- Preserve technical terms precisely — this is used to help a company decide whether to bid, so a mistranslated quantity, material, or scope is a real error, not a stylistic one.
- Return exactly one output item per input item, matched back by the echoed slug (order doesn't need to match the input).
- Respond with ONLY a JSON object of the shape {"items": [{"slug": string, "titleZh": string, "summaryZh": string}, ...]} — no prose, no markdown fences.`;

export async function translateTenderBatchQwen(items: TenderToTranslate[]): Promise<TranslatedTender[]> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });

  const response = await client.chat.completions.create({
    model: "qwen3.6-plus",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          items.map((i) => ({ slug: i.slug, titleEs: sanitizeForApi(i.titleEs), summaryEs: sanitizeForApi(i.summaryEs) })),
        ),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Qwen translation batch returned no content (finish_reason: ${response.choices[0]?.finish_reason})`);

  const parsed = BatchTranslationSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`Qwen translation batch failed schema validation: ${parsed.error.message}`);

  return parsed.data.items;
}
