"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Tender } from "@/types/tender";
import type { ParticipationGuideLink } from "@/lib/participation-guides";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderOverview } from "@/components/tenders/TenderOverview";
import { RequirementSection } from "@/components/tenders/RequirementList";
import { KeyDatesTimeline } from "@/components/tenders/KeyDatesTimeline";
import { RiskList } from "@/components/tenders/RiskList";
import { SourcePanel } from "@/components/tenders/SourcePanel";
import { ObrasPorImpuestosNotice } from "@/components/tenders/ObrasPorImpuestosNotice";
import { isObrasPorImpuestos } from "@/lib/obras-por-impuestos";
import { deadlineIsInDocuments } from "@/lib/deadline-in-documents";
import { TenderViewTracker } from "@/components/analytics/TenderViewTracker";
import { ReleasedTenderNotice } from "@/components/tenders/ReleasedTenderNotice";

export function TenderDetailView({
  tender,
  showTrialCta = false,
  participationGuide,
  related,
  releasedNotice,
}: {
  tender: Tender;
  showTrialCta?: boolean;
  participationGuide?: ParticipationGuideLink;
  /** 相关在招项目, rendered on the server and placed last on the page. */
  related?: ReactNode;
  /** Set when this page is open only because its deadline passed three days ago. */
  releasedNotice?: "guest" | "member";
}) {
  const { locale } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-7 sm:px-8 sm:py-9">
      <TenderViewTracker tenderId={tender.id} />
      <Link
        href="/tenders"
        className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#536772] transition-colors hover:text-[#b86e00]"
      >
        <span aria-hidden="true">←</span> {localize(uiText.backToTenders, locale)}
      </Link>

      {releasedNotice && <ReleasedTenderNotice audience={releasedNotice} submissionDeadline={tender.submissionDeadline} />}

      <TenderOverview tender={tender} showTrialCta={showTrialCta} />

      <KeyDatesTimeline dates={tender.keyDates} publicationDate={tender.publicationDate} publicationDateIsEstimated={tender.publicationDateIsEstimated} submissionDeadline={tender.submissionDeadline} status={tender.status} deadlineInDocuments={deadlineIsInDocuments(tender)} />

      {tender.oneLineSummary && (
        <section className="relative overflow-hidden rounded-3xl border border-[#efd898] bg-[linear-gradient(135deg,#fff9e9_0%,#fff4d2_100%)] px-6 py-6 shadow-[0_22px_60px_-48px_rgba(126,78,0,.55)] sm:px-8 sm:py-7">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[#ffb21c]" />
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ffb21c] text-[#071826]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9h8M8 13h5"/><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 2-2Z"/></svg>
            </span>
            <div>
              <h2 className="text-base font-black text-[#071826] sm:text-lg">{localize(uiText.oneLineSummary, locale)}</h2>
              <p className="mt-0.5 text-xs font-medium text-[#7b6a45]">快速看懂这个项目具体采购什么</p>
            </div>
          </div>
          <p className="mt-5 border-t border-[#e8d79f] pt-5 text-lg font-black leading-8 tracking-[-0.015em] text-[#071826] sm:text-xl">
            {tender.oneLineSummary}
          </p>
        </section>
      )}

      <RequirementSection
        title={uiText.qualifications}
        description="参与项目必须满足的基础资格与合规条件"
        items={tender.qualifications}
      />
      <RequirementSection
        title={uiText.experienceRequirements}
        description="核对团队资历、同类业绩与专业能力门槛"
        items={tender.experienceRequirements}
      />
      <RequirementSection
        title={uiText.requiredDocuments}
        description="准备投标时需要提交的主要证明与响应材料"
        items={tender.requiredDocuments}
      />

      <RiskList risks={tender.risks} />
      <SourcePanel tender={tender} participationGuide={participationGuide} />

      {/*
        Last on the page (user, 2026-09-12: 移到最下面). It was directly under
        the overview, which put a wall of mechanism explanation between the
        reader and the project itself; down here it reads as the footnote it
        is, next to the official-entry panel it actually qualifies.
      */}
      {isObrasPorImpuestos(tender) && <ObrasPorImpuestosNotice />}

      {related}
    </div>
  );
}
