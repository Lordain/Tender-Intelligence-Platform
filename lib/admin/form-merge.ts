/**
 * Merges the fields a SERVER refresh changed into a form an admin is editing.
 *
 * Extracted from AdminTenderForm so the rule can be tested: it is the guard
 * on a real data-loss bug (2026-09-14). The cronograma paste writes
 * submission_deadline and award_date straight to the row and calls
 * router.refresh(); that re-renders the server components but merges the
 * payload "without losing unaffected client-side React (e.g. useState)"
 * (next/dist/docs, use-router), so the form kept the empty 投标截止日期 it had
 * been built with — and 保存修改 then submitted that empty value back, wiping
 * the date the paste had just stored.
 *
 * Re-seeding the whole form from the server would fix that and cause the
 * mirror-image bug: an admin who edits a title and then pastes a schedule
 * would lose the title to a refresh they never asked for. So the comparison
 * is three-way. `before` and `after` are the server's view of the row as it
 * was when this form last synced and as it is now; a field is taken only
 * where those two differ, and every other field keeps whatever is in `prev`.
 */
export function mergeServerChanges<T extends Record<string, unknown>>(prev: T, before: T, after: T): T {
  let next: T | null = null;
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (sameFieldValue(before[key], after[key])) continue;
    next ??= { ...prev };
    next[key] = after[key];
  }
  // Same object back when nothing changed, so React can skip the re-render.
  return next ?? prev;
}

/** Field-level equality, arrays included — the admin form holds one (industries). */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return Object.is(a, b);
}
