"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function AuthNav() {
  const { locale } = useLocale();
  const { user, loading, logout, supabaseConfigured } = useUser();
  const router = useRouter();

  if (!supabaseConfigured || loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[10rem] truncate text-xs text-zinc-500 sm:inline">
          {user.email}
        </span>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push("/");
          }}
          className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {localize(uiText.logout, locale)}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link
        href="/login"
        className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        {localize(uiText.login, locale)}
      </Link>
      <Link
        href="/register"
        className="rounded-full bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {localize(uiText.register, locale)}
      </Link>
    </div>
  );
}
