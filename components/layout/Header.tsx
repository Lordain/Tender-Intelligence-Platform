"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { AuthNav } from "@/components/layout/AuthNav";

export function Header({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();

  return (
    <header className="relative z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-16 items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-8">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-zinc-950 text-[10px] font-bold tracking-tight text-white dark:bg-white dark:text-zinc-950">
                TI
              </span>
              <span className="truncate text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
                Tender Intelligence
              </span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/"
                className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                {localize(uiText.navHome, locale)}
              </Link>
              <Link
                href="/tenders"
                className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                {localize(uiText.navTenders, locale)}
              </Link>
              <Link
                href="/saved"
                className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                {localize(uiText.navSaved, locale)}
              </Link>
              <Link
                href="/pricing"
                className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                {localize(uiText.navPricing, locale)}
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <AuthNav />
            <NotificationBell tenders={tenders} />
          </div>
        </div>

        <nav className="flex items-center justify-between border-t border-zinc-100 py-2 md:hidden dark:border-zinc-900">
          <Link
            href="/"
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            {localize(uiText.navHome, locale)}
          </Link>
          <Link
            href="/tenders"
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            {localize(uiText.navTenders, locale)}
          </Link>
          <Link
            href="/saved"
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            {localize(uiText.navSaved, locale)}
          </Link>
          <Link
            href="/pricing"
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            {localize(uiText.navPricing, locale)}
          </Link>
        </nav>
      </div>
    </header>
  );
}
