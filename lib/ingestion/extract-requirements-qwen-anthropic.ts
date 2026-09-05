import Anthropic from "@anthropic-ai/sdk";
import { extractTenderRequirements, type TenderExtraction, type ExtractionModel } from "@/lib/ingestion/extract-requirements";

/**
 * Second Qwen path (2026-09-03, per the user), via DashScope's
 * Anthropic-compatible endpoint (`https://dashscope-intl.aliyuncs.com/
 * apps/anthropic`) instead of extract-requirements-qwen.ts's OpenAI-
 * compatible one. Since this endpoint speaks the same request shape as
 * Claude's own API, this reuses extractTenderRequirements() completely
 * unchanged — native PDF `document` content blocks, structured output via
 * `output_config.format`, PDF chunking, and context-overflow retry all
 * apply exactly as they do for the Claude models, just pointed at a
 * different `baseURL`/`apiKey` and a Qwen model id instead of a Claude
 * one. Unlike extract-requirements-qwen.ts's text-only path (added first,
 * before this endpoint was known about — see that file's header comment
 * for why native PDF input couldn't be confirmed over the OpenAI-
 * compatible endpoint), this one gets native PDF vision "for free" if
 * DashScope's Anthropic-compat layer genuinely mirrors the real API.
 *
 * LIVE-TESTED 2026-09-03: real `document` content blocks ARE accepted
 * (confirmed by the size-limit errors below, which mean the request
 * parsed far enough to hit a length check). `output_config.format`
 * structured outputs are NOT reliable through this endpoint's translation
 * layer, though — real responses came back as a top-level JSON array
 * instead of an object, and separately with required array keys entirely
 * omitted rather than `[]` — so `useStructuredOutput: false` is passed
 * below to bypass that feature entirely (see runExtraction()'s header
 * comment in extract-requirements.ts for the full real-error detail).
 * `cache_control` prompt caching support remains unconfirmed either way.
 * Two more real, confirmed ceilings on top of Claude's own (see
 * pdf-split.ts): a 28,000,000-character cap on the base64 PDF field
 * itself, and a 16,777,216-byte cap on the overall request body — both
 * already accounted for in pdf-split.ts's chunk-size budget.
 *
 * `qwen3.6-plus` (2026-09-03) is a second selectable model, added per the
 * user's request to test whether it handles a specific real failure case
 * differently from qwen3.5-plus: a 33MB scanned Anexo that, after
 * splitting into chunks (native-PDF page/size limits — see pdf-split.ts),
 * came back with suspiciously tiny per-chunk input token counts (~535,
 * versus tens of thousands for a normal chunk) and an empty 0/0/0/0
 * result on qwen3.5-plus — see extract-requirements.ts's header comment
 * on isPdfNativeLimitError() for the confirmed size ceilings this is
 * unrelated to. Whether that's a qwen3.5-plus-specific weakness (worth
 * routing this kind of document to a different model) or a deeper
 * DashScope/chunked-PDF issue neither model can get past is what this
 * comparison is meant to answer — not assumed either way.
 */
export async function extractTenderRequirementsQwenAnthropic(
  filePath: string,
  context: { tenderNumber: string; title: string; buyer: string },
  model: Extract<ExtractionModel, "qwen3.5-plus" | "qwen3.6-plus"> = "qwen3.5-plus",
): Promise<TenderExtraction> {
  const client = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/apps/anthropic",
  });
  return extractTenderRequirements(filePath, context, model, client, false);
}
