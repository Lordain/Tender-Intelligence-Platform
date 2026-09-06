"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { AuthNav } from "@/components/layout/AuthNav";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function Header({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const pathname = usePathname();

  const links = [
    ["/", localize(uiText.navHome, locale)],
    ["/tenders", localize(uiText.navTenders, locale)],
    ["/saved", localize(uiText.navSaved, locale)],
    ["/pricing", localize(uiText.navPricing, locale)],
  ] as const;

  return (
    <header className="relative z-40 border-b border-white/10 bg-[#031521] text-white">
      <div className="mx-auto max-w-[94rem] px-5 sm:px-8">
        <div className="flex h-[4.75rem] items-center justify-between gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3 lg:justify-self-start" aria-label="拉美招投标平台首页">
            <BrandLogo variant="dark" className="size-11" priority />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-[0.08em]">拉美招投标平台</span>
              <span className="hidden text-[10px] tracking-[0.12em] text-white/60 sm:block">拉美市场 · 投标更有把握</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex lg:justify-self-center">
            {links.map(([href, label]) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`relative px-3 py-7 text-sm font-medium transition-colors xl:px-4 ${active ? "text-white" : "text-white/68 hover:text-white"}`}>
                  {label}
                  {active && <span className="absolute inset-x-3 bottom-[0.9rem] h-0.5 rounded-full bg-[#ffb21c] xl:inset-x-4" />}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-3 lg:justify-self-end">
            <AuthNav />
            <NotificationBell tenders={tenders} />
          </div>
        </div>

        <nav className="flex items-center justify-between overflow-x-auto border-t border-white/10 py-2 lg:hidden">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/8 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
