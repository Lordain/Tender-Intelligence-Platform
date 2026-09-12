"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary for everything under app/ (2026-09-06).
 * Before this existed the app had no boundary at all: any throw in a
 * Server Component — a Supabase timeout, one malformed row reaching
 * toTender() — reached the user in production as Next's bare
 * "Application error: a client-side exception has occurred", with no way
 * back and nothing logged anywhere the operator would see.
 *
 * `reset()` re-renders the segment, which is a genuine fix for the
 * transient case (a timeout, a cold connection) and harmless otherwise.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which Next
    // deliberately withholds from the browser in production.
    console.error("Unhandled application error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-5 py-20 sm:px-8">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Error</p>
      <h1 className="text-2xl font-black text-[#071826]">页面加载出错了</h1>
      <p className="text-sm leading-6 text-[#64717c]">
        这通常是一次临时故障。可以先点「重试」；如果反复出现，请把下面的错误编号发给我们，方便定位。
      </p>
      {error.digest && (
        <p className="rounded-lg border border-[#dbe2e5] bg-[#f7f8f7] px-3 py-2 font-mono text-[11px] text-[#52636e]">
          错误编号：{error.digest}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]"
        >
          重试
        </button>
        <Link
          href="/tenders"
          className="h-10 rounded-xl border border-[#d8e0e3] bg-white px-5 text-sm font-black leading-10 text-[#52636e] transition-colors hover:border-[#9aa5ab]"
        >
          返回招标项目
        </Link>
      </div>
    </div>
  );
}
