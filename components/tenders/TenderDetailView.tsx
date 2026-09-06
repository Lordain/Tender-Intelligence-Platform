"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderOverview } from "@/components/tenders/TenderOverview";
import { RequirementSection } from "@/components/tenders/RequirementList";
import { KeyDatesTimeline } from "@/components/tenders/KeyDatesTimeline";
import { RiskList } from "@/components/tenders/RiskList";
import { SourcePanel } from "@/components/tenders/SourcePanel";
import { TenderViewTracker } from "@/components/analytics/TenderViewTracker";

export function TenderDetailView({ tender }: { tender: Tender }) {
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

      <TenderOverview tender={tender} />

      <KeyDatesTimeline dates={tender.keyDates} />

      {tender.oneLineSummary && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 shadow-[0_18px_50px_-48px_rgba(6,27,43,.5)]">
          <span aria-hidden="true" className="mt-1 h-8 w-1 shrink-0 rounded-full bg-[#ffb21c]" />
          <p className="text-base font-black leading-6 text-[#071826] sm:text-lg">{tender.oneLineSummary}</p>
        </div>
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
      <SourcePanel tender={tender} />
    </div>
  );
}
