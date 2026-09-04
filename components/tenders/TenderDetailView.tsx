"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderOverview } from "@/components/tenders/TenderOverview";
import { RequirementSection } from "@/components/tenders/RequirementList";
import { KeyDatesTimeline } from "@/components/tenders/KeyDatesTimeline";
import { RiskList } from "@/components/tenders/RiskList";
import { SourcePanel } from "@/components/tenders/SourcePanel";

export function TenderDetailView({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-7 sm:px-8 sm:py-9">
      <Link
        href="/tenders"
        className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#536772] transition-colors hover:text-[#b86e00]"
      >
        <span aria-hidden="true">←</span> {localize(uiText.backToTenders, locale)}
      </Link>

      <TenderOverview tender={tender} />

      <KeyDatesTimeline dates={tender.keyDates} />

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
