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

type Mode = "password" | "magic-link";

export default function LoginPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  function nextPath() {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthFrame mode="login"><div><h1 className="text-3xl font-black text-[#071826]">登录</h1><p className="mt-4 rounded-xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#72521b]">{localize(uiText.authNotConfigured, locale)}</p></div></AuthFrame>
    );
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(nextPath());
  }

  async function handleMagicLinkSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setMagicLinkSent(true);
  }

  if (magicLinkSent) {
    return (
      <AuthFrame mode="login"><div className="flex w-full flex-col gap-3">
        <h1 className="text-xl font-black text-[#071826]">
          {localize(uiText.magicLinkSent, locale)}
        </h1>
        <p className="text-sm text-[#64717c]">{localize(uiText.magicLinkSentBody, locale)}</p>
      </div></AuthFrame>
    );
  }

  return (
    <AuthFrame mode="login"><div className="flex w-full flex-col gap-6">
      <h1 className="text-3xl font-black tracking-tight text-[#071826]">
        {localize(uiText.login, locale)}
      </h1>

      <div className="flex gap-1 rounded-xl bg-[#edf2f3] p-1 self-start">
        {(["password", "magic-link"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option);
              setError(null);
            }}
            aria-pressed={mode === option}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === option
                ? "bg-[#061b2b] text-white"
                : "text-[#64717c] hover:text-[#071826]"
            }`}
          >
            {localize(option === "password" ? uiText.passwordTab : uiText.magicLinkTab, locale)}
          </button>
        ))}
      </div>

      <form
        onSubmit={mode === "password" ? handlePasswordSubmit : handleMagicLinkSubmit}
        className="flex flex-col gap-4"
      >
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

        {mode === "password" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[#52636e]">
              {localize(uiText.passwordLabel, locale)}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm focus:border-[#ffb21c] focus:outline-none"
            />
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#ffb21c] px-4 py-3 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {localize(mode === "password" ? uiText.signIn : uiText.sendMagicLink, locale)}
        </button>
      </form>

      <p className="text-sm text-[#64717c]">
        {localize(uiText.dontHaveAccount, locale)}{" "}
        <Link href="/register" className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4">
          {localize(uiText.register, locale)}
        </Link>
      </p>
    </div></AuthFrame>
  );
}
