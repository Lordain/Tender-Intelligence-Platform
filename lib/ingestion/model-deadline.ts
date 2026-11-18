/**
 * A hard deadline for the model calls one admin request makes.
 *
 * The admin button's two passes (translate-all-tenders.ts and
 * generate-public-titles.ts) run inside a serverless request with a hard
 * 300 s limit. Each stops STARTING batches at its `stopAfterMs`, but a batch
 * already sent used to be awaited however long it took — and the OpenAI SDK
 * that talks to DashScope waits up to ten minutes per call by default, then
 * retries twice. One slow call was enough for the host to kill the request,
 * and the panel showed 「翻译」这一步超时被服务器中断 even at 18 rows
 * (2026-11-18): there is no row count small enough to fix a call that does
 * not come back.
 *
 * So every call carries an AbortSignal that fires at the deadline. A call cut
 * off there is not a failure of its rows: they are untouched in the database
 * and counted as left for the next run, which the panel starts by itself.
 */
export type ModelDeadline = {
  /** Abort signal for the next call, or undefined when there is no deadline (the CLI). */
  signal(): AbortSignal | undefined;
  /** True once the deadline has passed; a row not done by then is left for the next run, not failed. */
  passed(): boolean;
};

export function modelDeadline(startedAt: number, deadlineMs: number | undefined, now: () => number = Date.now): ModelDeadline {
  if (deadlineMs === undefined) return { signal: () => undefined, passed: () => false };
  const deadlineAt = startedAt + deadlineMs;
  return {
    signal: () => AbortSignal.timeout(Math.max(1, deadlineAt - now())),
    passed: () => now() >= deadlineAt,
  };
}
