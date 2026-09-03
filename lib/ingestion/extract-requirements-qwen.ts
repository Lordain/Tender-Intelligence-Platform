import OpenAI from "openai";
import { extractDocumentText } from "@/lib/ingestion/document-intake";
import { ExtractionSchema, SYSTEM_PROMPT, type TenderExtraction } from "@/lib/ingestion/extract-requirements";

/**
 * Cost-comparison alternative to extract-requirements.ts's Claude
 * Sonnet/Opus 5 path (2026-09-03) — see translate-titles-qwen.ts's
 * header for the full context.
 *
 * Unlike Claude/Gemini, this does NOT send the PDF natively. Qwen3.5-
 * Plus's exact support for native PDF input over DashScope's OpenAI-
 * compatible chat completions endpoint couldn't be confirmed via
 * WebSearch (2026-09-03) — evidence exists for Qwen's dedicated "-vl"
 * vision-language models handling files/images, but not a documented
 * request shape for plain qwen3.5-plus, and guessing the wrong content-
 * part shape here would silently produce garbage or a hard error rather
 * than a fair comparison. Extracts the PDF's text locally instead, with
 * the same `pdftotext` path document-intake.ts already uses and has
 * tested against real Compras MX/PEMEX documents, and sends that as a
 * plain text message — a well-established capability with nothing to
 * guess.
 *
 * See extract-requirements-qwen-anthropic.ts for a second Qwen path
 * (2026-09-03, per the user) via DashScope's Anthropic-compatible
 * endpoint instead — that one reuses extract-requirements.ts completely
 * unchanged, native PDF document blocks included, since it speaks the
 * same request shape as Claude. Kept alongside this text-only path
 * rather than replacing it, so their real output quality can be compared
 * directly through analyze-batch.ts (--provider=qwen vs
 * --provider=qwen-anthropic).
 *
 * This is a real, disclosed difference from the Claude/Gemini paths, not
 * a bug: Qwen loses whatever Claude/Gemini's native document vision
 * would catch from layout/tables/a scanned (non-text) page, so a real
 * quality gap here may reflect that gap, not the model's underlying
 * capability — factor this in when reading compare:extraction's output,
 * don't just compare the three columns as if they saw the same input.
 *
 * Same ExtractionSchema/SYSTEM_PROMPT as the Claude/Gemini paths.
 *
 * NOT LIVE-TESTED — no DASHSCOPE_API_KEY configured yet (2026-09-03). Run
 * `npm run compare:extraction <file.pdf>` once a key is added.
 */
export async function extractTenderRequirementsQwen(
  filePath: string,
  context: { tenderNumber: string; title: string; buyer: string },
): Promise<TenderExtraction> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });

  const documentText = await extractDocumentText(filePath);

  const response = await client.chat.completions.create({
    model: "qwen3.5-plus",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nRespond with ONLY a JSON object matching {"qualifications": [...], "experienceRequirements": [...], "requiredDocuments": [...], "risks": [...]} — no prose, no markdown fences. Each requirement item is {"title", "description", "mandatory", "sourceReference"}; each risk item is {"level", "title", "description", "sourceReference"} with level one of "low"/"medium"/"high"/"critical".`,
      },
      {
        role: "user",
        content: `Tender ${context.tenderNumber} — "${context.title}" (${context.buyer}). Extract qualifications, experience requirements, required documents, and risks from the document text below.\n\n---\n\n${documentText}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Qwen extraction returned no content for ${context.tenderNumber} (finish_reason: ${response.choices[0]?.finish_reason})`);

  const parsed = ExtractionSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`Qwen extraction failed schema validation for ${context.tenderNumber}: ${parsed.error.message}`);

  return parsed.data;
}
