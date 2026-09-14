/**
 * Runs tasks a few at a time, stopping early when asked.
 *
 * Extracted from analyzeLocalFolder() so the part most likely to be wrong
 * can be tested without a database or a model: a worker pool's bugs —
 * exceeding its width, dropping the last item, continuing after a stop was
 * decided, throwing away work already in flight — are all silent, and all
 * of them here would cost either money or results.
 *
 * Three guarantees, each one asserted in scripts/test-extraction-pipeline.ts:
 *
 * 1. Never more than `width` tasks in flight.
 * 2. Once `shouldStop()` is true, no further task is STARTED — but every
 *    task already running is awaited to completion. A model call already
 *    paid for is never abandoned to save a few seconds.
 * 3. `run` is never called twice for the same index, and `completed`
 *    counts what actually finished — which is what "N remaining" in the
 *    admin UI is computed from, so an off-by-one there would misreport
 *    what the user was billed for.
 *
 * `run` is expected to handle its own failures; a task that throws would
 * reject the whole pool, which is why the caller catches per task.
 */
export async function runPool<T>(
  items: readonly T[],
  width: number,
  run: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<{ completed: number }> {
  let next = 0;
  let completed = 0;

  const worker = async () => {
    for (;;) {
      if (shouldStop()) return;
      const index = next;
      if (index >= items.length) return;
      next += 1;
      try {
        await run(items[index], index);
      } finally {
        completed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, items.length)) }, worker));
  return { completed };
}
