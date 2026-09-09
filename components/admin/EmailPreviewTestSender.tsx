"use client";

import { useState } from "react";

export function EmailPreviewTestSender() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTest() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/email-preview/test", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "测试邮件发送失败。");
      setMessage(result.message ?? "测试邮件已发送到当前管理员邮箱。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "测试邮件发送失败。");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-[#071826]">管理员发送测试</h2>
          <p className="mt-1 text-sm leading-6 text-[#64717c]">将下方模拟内容发送到当前登录管理员邮箱，不会发送给客户或修改客户通知设置。</p>
        </div>
        <button type="button" onClick={sendTest} disabled={sending} className="h-11 shrink-0 rounded-xl bg-[#071826] px-5 text-sm font-black text-white transition-colors hover:bg-[#12364d] disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? "发送中…" : "发送测试邮件"}
        </button>
      </div>
      {message && <p className="mt-4 text-sm font-bold text-emerald-700">{message}</p>}
      {error && <p className="mt-4 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
