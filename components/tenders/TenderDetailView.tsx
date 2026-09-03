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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-12">
      <Link
        href="/tenders"
        className="w-fit text-sm font-semibold text-[#536772] hover:text-[#b86e00]"
      >
        ← {localize(uiText.backToTenders, locale)}
      </Link>

      <TenderOverview tender={tender} />

      <RequirementSection
        title={uiText.qualifications}
        items={tender.qualifications}
      />
      <RequirementSection
        title={uiText.experienceRequirements}
        items={tender.experienceRequirements}
      />
      <RequirementSection
        title={uiText.requiredDocuments}
        items={tender.requiredDocuments}
      />

      <KeyDatesTimeline dates={tender.keyDates} />
      <RiskList risks={tender.risks} />
      <SourcePanel tender={tender} />
    </div>
  );
}
