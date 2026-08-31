"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { localize, uiText, useLocale } from "@/lib/i18n";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function LoginPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="text-sm text-zinc-500">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.login, locale)}
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {localize(uiText.signIn, locale)}
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
