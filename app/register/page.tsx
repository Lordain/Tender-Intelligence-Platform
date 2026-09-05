"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { safeNextPath } from "@/lib/auth-redirect";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function RegisterPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  function nextPath() {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthFrame mode="register"><div><h1 className="text-3xl font-black text-[#071826]">注册</h1><p className="mt-4 rounded-xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#72521b]">{localize(uiText.authNotConfigured, locale)}</p></div></AuthFrame>
    );
  }

  if (confirmationSent) {
    return (
      <AuthFrame mode="register"><div className="flex w-full flex-col gap-3">
        <h1 className="text-xl font-black text-[#071826]">
          {localize(uiText.checkYourEmail, locale)}
        </h1>
        <p className="text-sm text-[#64717c]">{localize(uiText.checkYourEmailBody, locale)}</p>
      </div></AuthFrame>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.replace(nextPath());
    } else {
      setConfirmationSent(true);
    }
  }

  return (
    <AuthFrame mode="register"><div className="flex w-full flex-col gap-6">
      <h1 className="text-3xl font-black tracking-tight text-[#071826]">
        {localize(uiText.register, locale)}
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[#52636e]">
            {localize(uiText.emailLabel, locale)}
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm focus:border-[#ffb21c] focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[#52636e]">
            {localize(uiText.passwordLabel, locale)}
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm focus:border-[#ffb21c] focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#ffb21c] px-4 py-3 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {localize(uiText.createAccount, locale)}
        </button>
      </form>
      <p className="text-sm text-[#64717c]">
        {localize(uiText.alreadyHaveAccount, locale)}{" "}
        <Link href="/login" className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4">
          {localize(uiText.login, locale)}
        </Link>
      </p>
      <p className="text-xs leading-5 text-[#87939a]">创建账户即表示你同意<Link href="/terms" className="mx-1 underline underline-offset-2">服务条款</Link>并了解<Link href="/privacy" className="ml-1 underline underline-offset-2">隐私政策</Link>。</p>
    </div></AuthFrame>
  );
}
