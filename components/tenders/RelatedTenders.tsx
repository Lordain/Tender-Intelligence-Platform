import Link from "next/link";
import type { TenderLink } from "@/lib/tender-links";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";
import { TenderLinkCards } from "@/components/tenders/TenderLinkCards";
import { countryLabel } from "@/lib/tender-labels";
import { countryPagePath } from "@/lib/country-pages";

/**
 * 同国家的其他在招项目 — at most three (user, 2026-09-25: 建议不超过3个项目),
 * at the foot of a tender's detail page, after everything about the tender
 * itself. Renders nothing when the country has no other live tender.
 */
export function RelatedTenders({ links, country }: { links: TenderLink[]; country: string }) {
  if (links.length === 0) return null;
  const name = countryLabel(country, "zh");
  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading title="相关在招项目" description={`同在${name}、行业相近的其他项目`} />
      <TenderLinkCards links={links} />
      <Link href={countryPagePath(country)} className="self-start text-sm font-black text-[#a96100] transition hover:text-[#071826]">
        查看{name}全部在招项目 →
      </Link>
    </section>
  );
}
