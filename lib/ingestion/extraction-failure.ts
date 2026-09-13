/**
 * Decides whether a failed document extraction is worth continuing past.
 *
 * Written after a real, expensive 2026-09-13 run: five Peru bases PDFs
 * were analysed one after another, and all five failed with the SAME
 * message — a required schema key the prompt never asked for. The first
 * failure already contained everything needed to know the other four
 * would fail identically, and the batch billed four more model calls
 * anyway. Nothing in the pipeline was watching.
 *
 * Two kinds of failure, and only one of them is worth retrying on the
 * next document:
 *
 * - "systematic" — a property of the CODE or the ACCOUNT, identical for
 *   every document: a schema/shape contract bug, a bad or missing API
 *   key, an exhausted quota, an unknown model id, a missing poppler
 *   binary. The next document cannot do better. Stop, and say why.
 * - "document" — a property of THIS file: too large, too many pages,
 *   corrupt, no text layer, a context overflow. The next document is a
 *   different file and may well succeed. Keep going.
 *
 * Anything unrecognised is treated as "document" — a wrong guess there
 * costs one extra call, while a wrong guess the other way silently
 * abandons a batch the user asked for. Consecutive-failure counting
 * (see shouldAbortBatch) covers the unrecognised-but-really-systematic
 * case without needing this list to be exhaustive.
 */
export type ExtractionFailureKind = "systematic" | "document";

const SYSTEMATIC_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // The exact class that caused the 2026-09-13 run. A response shape the
  // code rejects is a contract bug between prompt and schema; every
  // document goes through the same prompt and the same schema.
  { pattern: /failed schema validation/i, reason: "模型返回的结构不符合我们的 schema —— 这是代码问题，换一个文档不会变" },
  { pattern: /no json object found in response/i, reason: "模型没有返回 JSON —— 提示词或 provider 配置问题，换一个文档不会变" },
  { pattern: /invalid[_ ]api[_ ]key|authentication[_ ]error|\b401\b|\b403\b/i, reason: "API key 无效或没有权限" },
  { pattern: /insufficient[_ ]quota|credit balance|billing|arrears|欠费/i, reason: "账户额度或账单问题" },
  { pattern: /model[_ ]not[_ ]found|not a valid model|unknown model|invalid model/i, reason: "模型 id 无效" },
  { pattern: /ENOENT.*\b(pdfinfo|pdftotext|pdfseparate|pdfunite)\b|\b(pdfinfo|pdftotext|pdfseparate|pdfunite)\b.*ENOENT/i, reason: "本机缺少 poppler 工具" },
  { pattern: /DASHSCOPE_API_KEY|ANTHROPIC_API_KEY/i, reason: "缺少 API key 环境变量" },
];

export function classifyExtractionFailure(err: unknown): { kind: ExtractionFailureKind; reason?: string } {
  const message = err instanceof Error ? err.message : String(err);
  const hit = SYSTEMATIC_PATTERNS.find((entry) => entry.pattern.test(message));
  return hit ? { kind: "systematic", reason: hit.reason } : { kind: "document" };
}

/**
 * How many document-level failures in a row, with nothing succeeding in
 * between, before a batch gives up anyway.
 *
 * Two, not one: a batch whose first document happens to be a corrupt or
 * oversized file is a real and ordinary case, and stopping the whole run
 * over it would be its own kind of waste. Two consecutive failures with
 * zero successes is no longer a coincidence worth paying to confirm.
 */
export const MAX_CONSECUTIVE_FAILURES = 2;

export function shouldAbortBatch(state: { consecutiveFailures: number; anySucceeded: boolean }): boolean {
  return !state.anySucceeded && state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/**
 * Marks an error as "already diagnosed as systematic, stop the batch" as
 * it travels up from one file's extraction, through one tender's
 * analysis, to the folder-level loop — which has no other way to tell a
 * batch-ending failure from an ordinary one-tender failure.
 */
export const SYSTEMATIC_FAILURE_PREFIX = "【系统性错误，已中止】";

export function isSystematicFailureError(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).startsWith(SYSTEMATIC_FAILURE_PREFIX);
}

/**
 * Wall-clock ceiling for one batch run.
 *
 * The per-call bounds in extract-requirements.ts cap a single model call;
 * this caps the run. Both exist because they fail differently: a call that
 * hangs is bounded by its own timeout, while a run of documents that are
 * each merely slow is bounded by nothing at all — which is how a batch
 * reached 31 minutes on 2026-09-13 and returned nothing.
 *
 * Checked BETWEEN tenders, never mid-call: interrupting a call already paid
 * for would throw away the result and the money both. So the real ceiling is
 * this budget plus however long the last tender takes — stated here rather
 * than pretended away.
 */
export const BATCH_BUDGET_MS = 20 * 60 * 1000;

export function batchBudgetExhausted(startedAt: number, now: number = Date.now()): boolean {
  return now - startedAt >= BATCH_BUDGET_MS;
}
