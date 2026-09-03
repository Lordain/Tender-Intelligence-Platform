import Anthropic from "@anthropic-ai/sdk";
import { extractTenderRequirements, type TenderExtraction } from "@/lib/ingestion/extract-requirements";

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
 * NOT LIVE-TESTED. Real, disclosed uncertainty: whether every feature the
 * underlying call uses is actually supported by DashScope's compat layer —
 * native `document` content blocks, `output_config.format` structured
 * outputs, and `cache_control` prompt caching in particular — is unknown
 * pending a real run. A genuine incompatibility will surface as a real
 * 4xx from this endpoint, which is what to fix against rather than a
 * guess about where the gap is. Run `npm run analyze:batch -- <folder>
 * --provider=qwen-anthropic` once DASHSCOPE_API_KEY is set and report
 * back whatever the first real error/result looks like.
 */
export async function extractTenderRequirementsQwenAnthropic(
  filePath: string,
  context: { tenderNumber: string; title: string; buyer: string },
): Promise<TenderExtraction> {
  const client = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/apps/anthropic",
  });
  return extractTenderRequirements(filePath, context, "qwen3.5-plus", client);
}
