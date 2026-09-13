import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";
import type { TenderToTranslate, TranslatedTender } from "@/lib/ingestion/translate-titles";

/**
 * The es->zh title/summary translation path (2026-09-08, the user's
 * explicit choice). Added 2026-09-03 as a cost comparison against
 * translate-titles.ts's Claude Haiku 4.5, which it has now replaced;
 * that module stays as the alternative and keeps the shared
 * TenderToTranslate/TranslatedTender types, so
 * scripts/compare-translation-providers.ts still runs both and switching
 * back is one import line in translate-all-tenders.ts.
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
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured, not read a stilted word-for-word rendering. Chinese puts the place before the thing: 塔巴斯科州韦曼吉约（Huimanguillo）梅斯卡拉帕河（Río Mezcalapa）护岸工程, not 护岸工程，塔巴斯科州韦曼吉约. Spanish trails its locations after a comma; do not carry that order over.
- Keep proper nouns (agency names, place names, standard/law citations) recognizable — transliterate, or keep the Spanish acronym, where a standard Chinese equivalent doesn't exist (e.g. "PEMEX" stays "PEMEX", not translated).
- Put the Spanish in full-width parentheses after a transliterated place, facility or project name: 马塔德罗（Matadero）泵站, 阿瓜弗里亚（Agua Fría）泉, 韦曼吉约（Huimanguillo）, 皮乌拉（Piura）, 卡塔考斯（Catacaos）. This name is the one thing in a title a bidder must match against a map and against the bid documents, and a transliteration on its own appears in neither — 阿瓜弗里亚 is unsearchable, Agua Fría is not.
  Add it by default. The exception is narrow: a country, a capital, or a first-level division already familiar in Chinese — 墨西哥, 哥伦比亚, 波哥大, 利马, 下加利福尼亚州, 塔巴斯科州. Everything below that level takes the parenthesis however sure you are of the transliteration: a municipality, a district, a village, a river, a neighbourhood, a refinery, a pump station. 韦曼吉约 and 马尔卡韦利卡 are not names a reader can look up, and a confident transliteration is still unsearchable.
  Copy the name inside the parentheses exactly as the Spanish writes it, letter for letter — CATACAOS is （Catacaos）, never （Catacos）. Normalising case and accents is fine and correct: RIO MEZCALAPA earning （Río Mezcalapa）is right. Adding, dropping or altering a letter is not.
  The parenthesis holds the name alone, not the administrative word the Chinese already carries: DISTRITO DE CAJAMARCA is 卡哈马卡区（Cajamarca）, never 卡哈马卡区（Distrito de Cajamarca）.
  Once per distinct name in a field. Peru routinely gives a district, its province and its department the same name; write 卡哈马卡区（Cajamarca）、卡哈马卡省、卡哈马卡大区 — the parenthesis on the first mention only.
- Preserve technical terms precisely — this is used to help a company decide whether to bid, so a mistranslated quantity, material, or scope is a real error, not a stylistic one.
- Add nothing the source does not say. Most of these rows carry a summary that is a verbatim copy of the title, because the source published no separate description; when that happens the Chinese summary should render the Spanish and stop, even though the result is short and reads like a title. Do not pad it into something summary-shaped — no added purpose ("aimed at improving regional connectivity"), no added deliverables ("and the engineering and related services required to return it to service"), no procurement-stage note pulled in from elsewhere. The reader is deciding whether to bid on exactly the scope stated, and invented scope is the most expensive kind of error here.
- Do not narrow a general term into a specific one. "Servicios a Pozos" is well services in general, not workover or completion specifically; translate the breadth the Spanish actually has.
- Within one item, render a given Spanish term the same way in the title and in the summary. The same wall translated as 前墙 in one and 前壁 in the other reads as two different things.
- Every word of the output is Chinese. Leaving a Spanish or English word sitting in a Chinese sentence ("视频 surveillance 和监控系统") is not a translation. The exception is a name kept deliberately recognizable — an agency acronym, a brand, a place — which is the rule above, not a licence to skip a common noun.
- Two different Spanish words listed together are two different things, so give them two different Chinese words. "vigilancia y seguridad" is guarding and security, not 安保与安保; collapsing a pair into one repeated word tells the reader the source said something it did not.
- A number qualifying a facility is not automatically its identifier. "Hospital General de Zona de 144 camas" is a 144-bed zone general hospital, not hospital number 144 — Hospital General de Zona is IMSS's name for a facility class and the count that follows describes its size. Read what the number measures before turning it into an index.
- An item marked "titleTruncated": true had its Spanish title cut off by the source — it ends in an ellipsis, and the summary carries the whole sentence. Build titleZh from the summary instead of translating the fragment: one complete, concise Chinese title naming the work, the asset and the place. Keep it to title length; this is the name shown in a list, not the summary repeated. summaryZh is still the summary.
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
          items.map((i) => ({
            slug: i.slug,
            titleEs: sanitizeForApi(i.titleEs),
            summaryEs: sanitizeForApi(i.summaryEs),
            // Omitted rather than sent false, so the flag only ever appears
            // on the rows it applies to and cannot read as a field the model
            // should weigh on every item.
            ...(i.titleIsTruncated ? { titleTruncated: true } : {}),
          })),
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
