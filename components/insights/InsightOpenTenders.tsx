import { getCachedTenderList } from "@/lib/tenders";
import { featuredTenderLinksForCountry } from "@/lib/tender-links";
import { TenderLinkRows } from "@/components/tenders/TenderLinkCards";

/**
 * Up to three live tenders inside an insight page's dark 「From outlook to
 * tenders」 panel (user, 2026-09-25: 建议不超过3个项目). Rows in that panel's
 * own look, so the section reads as it did — with the projects it was
 * already pointing at now in it. Renders nothing when the country has none.
 */
export async function InsightOpenTenders({ country, accentText, accentBorder }: {
  country: string;
  accentText: string;
  accentBorder: string;
}) {
  const links = featuredTenderLinksForCountry(await getCachedTenderList(), country);
  if (links.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-bold text-white/55">当前在招项目精选</p>
      <TenderLinkRows links={links} accentText={accentText} accentBorder={accentBorder} />
    </div>
  );
}
