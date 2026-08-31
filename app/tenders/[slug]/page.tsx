"use client";

import { use } from "react";
import Link from "next/link";
import { getTenderBySlug } from "@/lib/tenders";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderOverview } from "@/components/tenders/TenderOverview";
import { RequirementSection } from "@/components/tenders/RequirementList";
import { KeyDatesTimeline } from "@/components/tenders/KeyDatesTimeline";
import { RiskList } from "@/components/tenders/RiskList";
import { SourcePanel } from "@/components/tenders/SourcePanel";

export default function TenderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { locale } = useLocale();
  const tender = getTenderBySlug(slug);

  if (!tender) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-6 py-16">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.notFoundTitle, locale)}
        </h1>
        <p className="text-sm text-zinc-500">{localize(uiText.notFoundBody, locale)}</p>
        <Link
          href="/tenders"
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
        >
          {localize(uiText.backToTenders, locale)}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <Link
        href="/tenders"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
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
