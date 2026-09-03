import { GoogleGenAI, Type } from "@google/genai";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";
import type { TenderToTranslate, TranslatedTender } from "@/lib/ingestion/translate-titles";

/**
 * Cost-comparison alternative to translate-titles.ts's Claude Haiku 4.5
 * path (2026-09-03) — see translate-titles-qwen.ts's header for the full
 * context (same request from the user, evaluating cheaper providers for
 * translation before committing to one).
 *
 * Gemini 3.1 Flash-Lite via the current, unified `@google/genai` SDK —
 * confirmed real (WebSearch, 2026-09-03, since this model postdates
 * training data): model id `gemini-3.1-flash-lite`, reads
 * GEMINI_API_KEY, `ai.models.generateContent()` with
 * `config.responseSchema` for real JSON-schema-enforced structured
 * output (a stronger guarantee than Qwen's JSON-mode-only path in
 * translate-titles-qwen.ts — Gemini's schema enforcement for this SDK
 * generation is documented, not assumed).
 *
 * NOT LIVE-TESTED — no GEMINI_API_KEY is configured yet (2026-09-03).
 * Request/response shape is grounded in real, current (2026)
 * documentation fetched via WebSearch, not guessed from training-data
 * memory of the older @google/generative-ai SDK this replaced. Run
 * `npm run compare:translation` once a key is added to confirm this
 * actually works before trusting it at scale.
 */

const SYSTEM_PROMPT = `You translate Mexican/Latin American government tender titles and summaries from Spanish to Chinese, for a platform that helps Chinese enterprises evaluate real bidding opportunities.

Ground rules:
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured, not read a stilted word-for-word rendering.
- Keep proper nouns (agency names, place names, standard/law citations) recognizable — transliterate, or keep the Spanish acronym, where a standard Chinese equivalent doesn't exist (e.g. "PEMEX" stays "PEMEX", not translated).
- Preserve technical terms precisely — this is used to help a company decide whether to bid, so a mistranslated quantity, material, or scope is a real error, not a stylistic one.
- Return exactly one output item per input item, matched back by the echoed slug (order doesn't need to match the input).`;

export async function translateTenderBatchGemini(items: TenderToTranslate[]): Promise<TranslatedTender[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: JSON.stringify(
      items.map((i) => ({ slug: i.slug, titleEs: sanitizeForApi(i.titleEs), summaryEs: sanitizeForApi(i.summaryEs) })),
    ),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slug: { type: Type.STRING },
                titleZh: { type: Type.STRING },
                summaryZh: { type: Type.STRING },
              },
              required: ["slug", "titleZh", "summaryZh"],
            },
          },
        },
        required: ["items"],
      },
    },
  });

  if (!response.text) throw new Error("Gemini translation batch returned no text");

  const parsed = JSON.parse(response.text) as { items: TranslatedTender[] };
  return parsed.items;
}
