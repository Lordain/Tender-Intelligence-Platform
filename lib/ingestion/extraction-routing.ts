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
 * 2. Every text-layer document goes to qwen3.7-plus, whatever the tier
 *    (2026-10-09, user: Qwen 3.5 plus 和 Qwen 3.6 plus 统一改成 Qwen 3.7
 *    plus). Until then a flagship (大型项目) got qwen3.6-plus and the rest
 *    the cheaper qwen3.5-plus. The tier still sets the page cap below.
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
  if (!hasTextLayer) return "claude-haiku-5-5";
  void tier; // one Qwen for every tier since 2026-10-09; kept in the signature for the caller's log line
  return "qwen3.7-plus";
}

/** For log lines and admin-facing messages — why this model, in one clause. */
export function describeExtractionRouting(hasTextLayer: boolean, tier: TenderRelevanceTier | null | undefined): string {
  if (!hasTextLayer) return "扫描件（无文字层）";
  return tier === "flagship" ? "大型项目（flagship）" : `${tier ?? "未分级"}（非大型项目）`;
}

/**
 * How many pages of a document are worth paying to read, by tier
 * (2026-09-11, explicit request: 常规项目前 20 页、中型项目前 30 页、大型项目
 * 前 40 页).
 *
 * A 900-page, 100MB tender is real here, and almost all of it is annexes,
 * price schedules and boilerplate. What this platform extracts —
 * qualifications, experience requirements, required documents, risks — is
 * stated in the opening sections; reading to the end multiplies the token
 * bill without adding fields.
 *
 * The cap scales with the tier for the same reason the model does: a
 * flagship tender is worth more care. An unclassified row gets the standard
 * cap, the cheaper default when scale is unknown — matching
 * chooseExtractionModel()'s treatment of the same case.
 */
export function maxPagesForTier(tier: TenderRelevanceTier | null | undefined): number {
  if (tier === "flagship") return 40;
  if (tier === "significant") return 30;
  return 20;
}
