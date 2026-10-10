"use client";

import { useSyncExternalStore } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const noop = () => () => {};

/**
 * 「剩 N 天」 beside a homepage card's 计划交标 label (user, 2026-10-04: 动画方案 4;
 * moved up beside the label and made smaller 2026-10-10, so it never wraps).
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
    <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-black leading-4 ${urgent ? "bg-[#fde4df] text-[#b42318]" : "bg-[#ffe7b0] text-[#7a5310]"}`}>
      {days === 0 ? "今天截标" : `剩 ${days} 天`}
    </span>
  );
}
