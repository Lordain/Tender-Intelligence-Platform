"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TRIAL_DAYS, type AccessPromptKind } from "@/lib/access-control";
import { loginPathFor } from "@/lib/auth-redirect";

const COPY = {
  login: {
    eyebrow: "Member access",
    title: "登录后继续",
    description: "项目搜索、筛选和公开信息无需登录；免费注册后可试用完整分析，试用结束仍可每月查看 5 个完整项目。",
    action: "登录 / 注册",
  },
  subscription: {
    eyebrow: "Subscriber access",
    title: "订阅后使用项目功能",
    description: `您的 ${TRIAL_DAYS} 天免费试用已结束。免费版每月可查看 5 个完整项目；订阅后可查看更多，并使用收藏与跟踪功能。`,
    action: "查看订阅方案",
  },
} as const;

export function AccessPrompt({
  open,
  kind,
  nextPath,
  onClose,
}: {
  open: boolean;
  kind: AccessPromptKind;
  nextPath: string;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  const copy = COPY[kind];
  const actionHref = kind === "login" ? loginPathFor(nextPath) : "/pricing";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#031521]/68 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="access-prompt-title" className="w-full max-w-md rounded-3xl border border-white/70 bg-[#fffdf9] p-7 shadow-[0_30px_100px_-35px_rgba(0,0,0,.75)] sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#fff0ca] text-[#a96100]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        </div>
        <p className="mt-6 text-[11px] font-black uppercase tracking-[0.18em] text-[#b86e00]">{copy.eyebrow}</p>
        <h2 id="access-prompt-title" className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#071826]">{copy.title}</h2>
        <p className="mt-4 text-sm leading-7 text-[#64717c]">{copy.description}</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onClose ? (
            <button type="button" onClick={onClose} className="h-11 rounded-xl border border-[#d8e0e3] px-5 text-sm font-bold text-[#52636e] hover:bg-[#f1f3f2]">暂不</button>
          ) : (
            <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8e0e3] px-5 text-sm font-bold text-[#52636e] hover:bg-[#f1f3f2]">返回首页</Link>
          )}
          <Link href={actionHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] hover:bg-[#ffc247]">{copy.action}</Link>
        </div>
      </section>
    </div>
  );
}
