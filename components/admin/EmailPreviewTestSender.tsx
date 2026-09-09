"use client";

import { useState } from "react";

export function EmailPreviewTestSender() {
  const [sending, setSending] = useState<"digest" | "renewal" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTest(kind: "digest" | "renewal") {
    setSending(kind);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/email-preview/test${kind === "renewal" ? "?kind=renewal" : ""}`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "测试邮件发送失败。");
      setMessage(result.message ?? "测试邮件已发送到当前管理员邮箱。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "测试邮件发送失败。");
    } finally {
      setSending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-[#071826]">管理员发送测试</h2>
          <p className="mt-1 text-sm leading-6 text-[#64717c]">将招标通知或续费提醒的模拟邮件发送到当前登录管理员邮箱，不会发送给客户或修改客户通知设置。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => sendTest("digest")} disabled={sending !== null} className="h-11 shrink-0 rounded-xl border border-[#071826] bg-white px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#f3f5f4] disabled:cursor-not-allowed disabled:opacity-50">
            {sending === "digest" ? "发送中…" : "发送招标通知测试"}
          </button>
          <button type="button" onClick={() => sendTest("renewal")} disabled={sending !== null} className="h-11 shrink-0 rounded-xl bg-[#071826] px-5 text-sm font-black text-white transition-colors hover:bg-[#12364d] disabled:cursor-not-allowed disabled:opacity-50">
            {sending === "renewal" ? "发送中…" : "发送续费提醒测试"}
          </button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm font-bold text-emerald-700">{message}</p>}
      {error && <p className="mt-4 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
