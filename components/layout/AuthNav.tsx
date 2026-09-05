"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function AuthNav() {
  const { locale } = useLocale();
  const { user, loading, logout, supabaseConfigured } = useUser();
  const router = useRouter();

  if (loading) return null;

  if (supabaseConfigured && user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/account"
          className="text-sm font-medium text-white/80 transition-colors hover:text-white"
        >
          账户
        </Link>
        <Link
          href="/account"
          className="hidden max-w-[10rem] truncate text-xs text-white/60 hover:text-white lg:inline"
        >
          {user.email}
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push("/");
          }}
          className="text-sm font-medium text-white/70 transition-colors hover:text-white"
        >
          {localize(uiText.logout, locale)}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        href="/login"
        className="rounded-xl border border-white/75 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white hover:text-[#061b2b]"
      >
        {localize(uiText.login, locale)}
      </Link>
      <Link
        href="/register"
        className="hidden rounded-xl bg-[#ffb21c] px-4 py-2 text-sm font-semibold text-[#071826] transition-colors hover:bg-[#ffc247] sm:inline-flex"
      >
        {localize(uiText.register, locale)}
      </Link>
    </div>
  );
}
