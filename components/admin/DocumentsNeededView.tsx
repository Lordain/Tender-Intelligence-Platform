"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TenderNeedingDocuments } from "@/types/tender";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_COLORS } from "@/lib/tender-labels";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * `/admin/documents-needed` — the worklist the user asked for: tenders
 * that already passed relevance screening (black/whitelist) but have no
 * attachments on file yet, so a human knows exactly which tenders to go
 * download documents for. Open to any logged-in user (not a separate
 * admin role — same auth-gate pattern as app/account/page.tsx), never
 * shown to anonymous visitors.
 */
export function DocumentsNeededView({ tenders }: { tenders: TenderNeedingDocuments[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="text-sm text-zinc-500">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  if (loading || !user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.documentsNeededTitle, locale)}
        </h1>
        <p className="max-w-3xl text-sm text-zinc-500">
          {localize(uiText.documentsNeededSubtitle, locale)}
        </p>
      </div>

      {tenders.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">
          {localize(uiText.documentsNeededEmpty, locale)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">{localize(uiText.colTitle, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.countryLabel, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colValueTier, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colPublicationDate, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colSourceLink, locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tenders.map((tender) => {
                const value = tender.estimatedValue
                  ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, locale)
                  : null;
                return (
                  <tr key={tender.slug}>
                    <td className="max-w-md px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {localize(tender.title, locale)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {countryLabel(tender.country, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RELEVANCE_TIER_COLORS[tender.relevanceTier]}`}
                      >
                        {localize(tender.relevanceLabel, locale)}
                      </span>
                      {value && <div className="mt-1 text-xs text-zinc-500">{value}</div>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(tender.publicationDate, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={tender.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
                      >
                        {localize(uiText.openSource, locale)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
