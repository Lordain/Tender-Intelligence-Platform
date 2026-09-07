import type { TenderRelevanceTier } from "@/types/tender";
import type { ExtractionModel } from "@/lib/ingestion/extract-requirements";

/**
 * Which model reads a tender document.
 *
 * Two independent questions, in this order.
 *
 * 1. Can the document be read as text at all? A scanned, image-only PDF
 *    goes to claude-haiku whatever the project is worth: it is the only
 *    provider confirmed to read image pages here, and it is also the way
 *    around the unresolved DashScope gap where a chunked/reassembled PDF
 *    comes back empty (see lib/ingestion/README.md, 2026-09-03/04). That
 *    decision is about the FILE and is not up for negotiation on scale.
 *
 * 2. Only then, how much is this tender worth getting right? A flagship
 *    (大型项目) document gets qwen3.6-plus; significant (中型) and standard
 *    (常规) stay on qwen3.5-plus, which is cheaper and has been the default
 *    for every text-layer document so far.
 *
 * The tier read here is the one stored on the tender — the same tag shown
 * in the product, including an admin's manual override — so the model that
 * analysed a document always matches the label the tender is filed under.
 * A missing tier (an unclassified row) is treated as not-flagship: the
 * cheaper model is the safe default when the scale is unknown.
 */
export function chooseExtractionModel(
  hasTextLayer: boolean,
  tier: TenderRelevanceTier | null | undefined,
): ExtractionModel {
  if (!hasTextLayer) return "claude-haiku-4-5-20251001";
  return tier === "flagship" ? "qwen3.6-plus" : "qwen3.5-plus";
}

/** For log lines and admin-facing messages — why this model, in one clause. */
export function describeExtractionRouting(hasTextLayer: boolean, tier: TenderRelevanceTier | null | undefined): string {
  if (!hasTextLayer) return "扫描件（无文字层）";
  return tier === "flagship" ? "大型项目（flagship）" : `${tier ?? "未分级"}（非大型项目）`;
}
