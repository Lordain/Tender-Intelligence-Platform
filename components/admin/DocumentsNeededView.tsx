"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenderNeedingDocuments } from "@/types/tender";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_COLORS } from "@/lib/tender-labels";
import { AnalyzeDocumentForm } from "@/components/admin/AnalyzeDocumentForm";

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
 *
 * Merged with the standalone "标书附件分析" page (2026-09-04, per the
 * user's request) — each row's "上传分析" toggle opens an
 * AnalyzeDocumentForm scoped to that exact tender, so the whole
 * download-then-analyze workflow stays on one page instead of copying a
 * slug over to a separate one. The write action itself still requires
 * real admin rights (app/api/admin/analyze-document/route.ts's
 * getAdminUser() check) even though anyone logged in can see this list
 * and open the form — a non-admin submitting gets a plain "unauthorized"
 * error rather than a silent failure. A general, any-slug form stays at
 * the bottom of the page for the one case the worklist itself can't
 * cover: a tender that already has one document on file but needs
 * another, or a re-analysis — it's filtered out of this list entirely
 * once tender_documents has any row for it.
 */
export function DocumentsNeededView({ tenders }: { tenders: TenderNeedingDocuments[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 text-sm text-[#64717c]">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  if (loading || !user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Document worklist</p>
        <h1 className="text-3xl font-black tracking-tight text-[#071826]">
          {localize(uiText.documentsNeededTitle, locale)}
        </h1>
        <p className="max-w-3xl text-sm text-[#64717c]">
          {localize(uiText.documentsNeededSubtitle, locale)} 点击&quot;上传分析&quot;可以直接把下载好的文件上传并跑分析，不用再跳到别的页面。
        </p>
      </div>

      {tenders.length === 0 ? (
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 text-sm text-[#64717c]">
          {localize(uiText.documentsNeededEmpty, locale)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-xs text-[#52636e]">
              <tr>
                <th className="px-4 py-3 font-medium">{localize(uiText.colTitle, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.countryLabel, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colValueTier, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colPublicationDate, locale)}</th>
                <th className="px-4 py-3 font-medium">{localize(uiText.colSourceLink, locale)}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9eb]">
              {tenders.map((tender) => {
                const value = tender.estimatedValue
                  ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, locale)
                  : null;
                const isOpen = openSlug === tender.slug;
                return (
                  <Fragment key={tender.slug}>
                    <tr>
                      <td className="max-w-md px-4 py-3 font-bold text-[#071826]">
                        {localize(tender.title, locale)}
                      </td>
                      <td className="px-4 py-3 text-[#5d6d77]">
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
                      <td className="px-4 py-3 text-[#5d6d77]">
                        {formatDate(tender.publicationDate, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={tender.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4"
                        >
                          {localize(uiText.openSource, locale)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenSlug(isOpen ? null : tender.slug)}
                          className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4"
                        >
                          {isOpen ? "收起" : "上传分析"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="bg-[#f7f5ef] px-4 py-5">
                          <AnalyzeDocumentForm
                            initialSlug={tender.slug}
                            lockSlug
                            compact
                            onDone={() => {
                              setOpenSlug(null);
                              router.refresh();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-[#e5e9eb] pt-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Any tender</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">手动上传分析</h2>
          <p className="mt-1 text-sm text-[#64717c]">
            上面列表只包含还没有任何文件的项目——如果要给一个已经有文件的项目补传第二份，或者重新分析，在这里手动填 slug。
          </p>
        </div>
        <AnalyzeDocumentForm />
      </div>
    </div>
  );
}
