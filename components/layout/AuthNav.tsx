"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function AuthNav() {
  const { locale } = useLocale();
  const { user, loading, logout, supabaseConfigured } = useUser();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  // Checked server-side (app/api/admin/whoami) rather than against a
  // client-bundled allowlist — ADMIN_EMAILS never ships to the browser.
  // This only controls whether the nav LINK shows; the real gate is still
  // app/admin/tenders/layout.tsx (and every app/api/admin/... route)
  // re-checking admin status itself. Rendered as `user && isAdminFlag`
  // below rather than resetting the flag back to false on logout here —
  // an effect body shouldn't call setState synchronously on its own
  // early-return path (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/admin/whoami")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return null;

  if (supabaseConfigured && user) {
    return (
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin/tenders"
            className="text-sm font-medium text-[#ffb21c] transition-colors hover:text-[#ffc247]"
          >
            后台管理
          </Link>
        )}
        <Link
          href="/account"
          className="text-sm font-medium text-white/80 transition-colors hover:text-white"
        >
          账户管理
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
