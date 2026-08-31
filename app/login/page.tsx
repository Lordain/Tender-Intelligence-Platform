"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { localize, uiText, useLocale } from "@/lib/i18n";

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

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="text-sm text-zinc-500">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
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

    router.push("/");
  }

  async function handleMagicLinkSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.magicLinkSent, locale)}
        </h1>
        <p className="text-sm text-zinc-500">{localize(uiText.magicLinkSentBody, locale)}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.login, locale)}
      </h1>

      <div className="flex gap-1 rounded-full border border-zinc-200 p-0.5 self-start dark:border-zinc-800">
        {(["password", "magic-link"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option);
              setError(null);
            }}
            aria-pressed={mode === option}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === option
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
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
          <span className="text-xs font-medium text-zinc-500">
            {localize(uiText.emailLabel, locale)}
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
          />
        </label>

        {mode === "password" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">
              {localize(uiText.passwordLabel, locale)}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {localize(mode === "password" ? uiText.signIn : uiText.sendMagicLink, locale)}
        </button>
      </form>

      <p className="text-sm text-zinc-500">
        {localize(uiText.dontHaveAccount, locale)}{" "}
        <Link href="/register" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
          {localize(uiText.register, locale)}
        </Link>
      </p>
    </div>
  );
}
