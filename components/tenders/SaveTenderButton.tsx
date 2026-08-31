"use client";

import { useSavedTenderIds } from "@/lib/saved";
import { localize, uiText, useLocale } from "@/lib/i18n";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M5 3.5A1.5 1.5 0 0 1 6.5 2h7A1.5 1.5 0 0 1 15 3.5v13.15a.5.5 0 0 1-.777.416L10 14.06l-4.223 3.007A.5.5 0 0 1 5 16.65V3.5Z" />
    </svg>
  );
}

export function SaveTenderButton({
  tenderId,
  className = "",
}: {
  tenderId: string;
  className?: string;
}) {
  const { locale } = useLocale();
  const { isSaved, toggle } = useSavedTenderIds();
  const saved = isSaved(tenderId);
  const label = localize(saved ? uiText.unsaveTender : uiText.saveTender, locale);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(tenderId);
      }}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
        saved
          ? "text-amber-500 hover:text-amber-600"
          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      } ${className}`}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}
