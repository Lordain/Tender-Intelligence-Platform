"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M10 2a5 5 0 0 0-5 5v2.586l-1.707 1.707A1 1 0 0 0 4 13h12a1 1 0 0 0 .707-1.707L15 9.586V7a5 5 0 0 0-5-5Z" />
      <path d="M8 15a2 2 0 0 0 4 0H8Z" />
    </svg>
  );
}

export function NotificationBell({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const { items, unreadCount, markAllRead } = useNotifications(tenders);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={localize(uiText.notifications, locale)}
        aria-expanded={open}
        className="relative inline-flex size-10 items-center justify-center rounded-xl border border-white/20 text-white/60 transition-colors hover:border-white/40 hover:bg-white/8 hover:text-white"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {localize(uiText.notifications, locale)}
            </span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                {localize(uiText.markAllRead, locale)}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">
              {localize(uiText.noNotifications, locale)}
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
              {items.map((item) => (
                <li key={`${item.searchId}-${item.tender.id}`}>
                  <Link
                    href={`/tenders/${item.tender.slug}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {item.tender.title[locale]}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {localize(uiText.matchedSearch, locale)} “{item.searchName}” ·{" "}
                      {formatDate(item.tender.publicationDate, locale)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
