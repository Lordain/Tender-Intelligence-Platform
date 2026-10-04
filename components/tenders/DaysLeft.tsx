"use client";

import { useSyncExternalStore } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const noop = () => () => {};

/**
 * 「还剩 N 天」 under a homepage card's deadline (user, 2026-10-04: 动画方案 4).
 *
 * Counted in the visitor's browser, never on the server: the homepage is a
 * cached page (revalidate = 300), so a count baked into its HTML would be up
 * to five minutes stale at best and a day wrong across midnight. The server
 * snapshot is null, so the server HTML carries nothing here and hydration has
 * nothing to disagree with; the count appears once the page runs.
 */
export function DaysLeft({ deadline }: { deadline: string }) {
  const days = useSyncExternalStore(
    noop,
    () => Math.ceil((Date.parse(deadline) - Date.now()) / DAY_MS),
    () => null,
  );
  if (days === null || Number.isNaN(days) || days < 0 || days > 365) return null;
  const urgent = days <= 7;
  return (
    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black ${urgent ? "bg-[#fde4df] text-[#b42318]" : "bg-[#ffe7b0] text-[#7a5310]"}`}>
      {days === 0 ? "今天截标" : `还剩 ${days} 天`}
    </span>
  );
}
