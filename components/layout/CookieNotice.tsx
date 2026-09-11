"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "lt-cookie-notice-ack-v1";

function readDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw on access. Showing the
    // notice again next visit is the harmless failure; silently never
    // showing it is not.
    return false;
  }
}

// Read once at module init on the client, never during the hydration render —
// useSyncExternalStore serves getServerSnapshot for that (see below). Same
// pattern as lib/saved.ts, for the same reason.
let dismissed = typeof window === "undefined" ? true : readDismissed();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dismiss() {
  dismissed = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Dismissal just won't persist for this visitor.
  }
  for (const listener of listeners) listener();
}

/**
 * A disclosure bar, deliberately NOT a consent gate.
 *
 * What this site actually stores decides the shape: a Supabase session
 * cookie that login cannot work without, and localStorage holding a random
 * analytics id, saved tenders and saved searches. No advertising cookie, no
 * cross-site tracker, no third-party tag — so there is nothing here a
 * visitor could meaningfully refuse while still using the site, and a
 * blocking "accept/reject" dialog would be theatre over choices that do not
 * exist. It states what is stored and links to the full policy.
 *
 * If a third-party analytics or advertising script is ever added, this is no
 * longer the right component: that would need prior consent with a real
 * refusal path, and the script must not load until it is given.
 *
 * Whether this satisfies LFPDPPP for the current cookie use is a question for
 * a Mexican lawyer, not something decided here (2026-09-11).
 */
export function CookieNotice() {
  // The server snapshot is "dismissed": server-rendered HTML can't know what
  // is in localStorage, so the hydration render has to agree that the bar is
  // hidden and only then switch to the real value.
  const hidden = useSyncExternalStore(
    subscribe,
    () => dismissed,
    () => true,
  );
  if (hidden) return null;

  return (
    <div
      role="region"
      aria-label="Cookie 与本地存储说明"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-white/10 bg-[#061b2b] px-5 py-4 text-white shadow-[0_20px_50px_-24px_rgba(6,27,43,.9)] sm:flex-row sm:items-center sm:gap-5">
        <p className="text-xs leading-6 text-white/78">
          本站使用维持登录所必需的 Cookie，并用浏览器本地存储保存统计标识、收藏和搜索设置。
          <span className="text-white/58">不使用广告或跨站追踪类 Cookie。</span>{" "}
          <Link href="/cookies" className="font-bold text-[#ffb21c] underline-offset-4 hover:underline">
            查看 Cookie 政策
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="h-10 shrink-0 rounded-xl bg-[#ffb21c] px-6 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] sm:ml-auto"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
