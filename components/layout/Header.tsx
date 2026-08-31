"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export function Header() {
  const { locale } = useLocale();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tender Intelligence
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {localize(uiText.navHome, locale)}
          </Link>
          <Link
            href="/tenders"
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {localize(uiText.navTenders, locale)}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
