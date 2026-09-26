import type { CountryInsightSummary } from "@/lib/country-insights";

/**
 * Photo credit under a country-insight hero. The heroes are Commons photos
 * under CC licences that require naming the author and the licence, with
 * links; kept small and in the corner so it does not compete with the title.
 */
export function InsightHeroCredit({ insight }: { insight: CountryInsightSummary }) {
  const { author, license, licenseUrl, sourceUrl } = insight.heroImageCredit;
  return (
    <p className="absolute bottom-3 right-5 z-10 max-w-[calc(100%-2.5rem)] text-right text-[10px] leading-4 text-white/45 sm:right-8">
      图片：{insight.heroImageAlt} ·{" "}
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-white/80 hover:underline">
        {author} / Wikimedia Commons
      </a>
      ，
      <a href={licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline-offset-2 hover:text-white/80 hover:underline">
        {license}
      </a>
    </p>
  );
}
