/**
 * Keep an already-sorted list's group order, but round-robin countries inside
 * each equal group.  The first country encountered in a group stays first;
 * this makes the change feel like a light reshuffle rather than a second sort.
 *
 * Callers define the group boundary (for example a bid-deadline day).  Items
 * from different groups are never crossed, so a later deadline cannot move in
 * front of an earlier one just to improve country variety.
 */
export function interleaveCountriesWithinEqualGroups<T extends { country: string }>(
  items: T[],
  groupKey: (item: T) => string,
): T[] {
  const result: T[] = [];

  for (let start = 0; start < items.length;) {
    const key = groupKey(items[start]);
    let end = start + 1;
    while (end < items.length && groupKey(items[end]) === key) end += 1;

    const group = items.slice(start, end);
    const queues = new Map<string, T[]>();
    for (const item of group) {
      const queue = queues.get(item.country);
      if (queue) queue.push(item);
      else queues.set(item.country, [item]);
    }

    let remaining = group.length;
    let offset = 0;
    while (remaining > 0) {
      for (const queue of queues.values()) {
        const item = queue[offset];
        if (item) {
          result.push(item);
          remaining -= 1;
        }
      }
      offset += 1;
    }

    start = end;
  }

  return result;
}

/** Date-only bucket for ISO dates/timestamps, with a defensive raw fallback. */
export function calendarDateBucket(value: string | undefined): string {
  if (!value) return "__no_date__";
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? value;
}
