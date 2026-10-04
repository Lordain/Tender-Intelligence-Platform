"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { safeNextPath } from "@/lib/auth-redirect";
import { authErrorMessage } from "@/lib/auth-errors";

/** Supabase itself refuses a second signup email within 60 seconds. */
const COOLDOWN_SECONDS = 60;

type ResendConfirmationProps = {
  email: string;
  /** Start the cooldown at once — on the "check your email" screen the first email has only just gone out. */
  startCoolingDown?: boolean;
};

/**
 * Sends the signup confirmation email again (supabase.auth.resend). Shown on
 * the post-signup screen and on /login when sign-in fails as unconfirmed.
 */
export function ResendConfirmation({ email, startCoolingDown = false }: ResendConfirmationProps) {
  const [cooldown, setCooldown] = useState(startCoolingDown ? COOLDOWN_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!email) {
      setStatus({ ok: false, text: "请先在上面填写注册时用的邮箱。" });
      return;
    }
    setSending(true);
    setStatus(null);
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    const { error } = await getSupabaseBrowserClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setSending(false);
    if (error) {
      setStatus({ ok: false, text: authErrorMessage(error) });
      return;
    }
    setCooldown(COOLDOWN_SECONDS);
    setStatus({ ok: true, text: `已重新发送到 ${email}，请查收（也看看垃圾邮件）。` });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={resend}
        disabled={sending || cooldown > 0}
        className="self-start rounded-xl border border-[#cfd9dd] bg-white px-4 py-2.5 text-sm font-bold text-[#071826] transition-colors hover:border-[#9eacb2] hover:bg-[#f7f9f9] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "正在发送…" : cooldown > 0 ? `重新发送确认邮件（${cooldown} 秒后可用）` : "重新发送确认邮件"}
      </button>
      {status && (
        <p role="status" className={`text-sm ${status.ok ? "text-[#1d6b3a]" : "text-red-600"}`}>{status.text}</p>
      )}
    </div>
  );
}
