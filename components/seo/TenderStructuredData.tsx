import { siteOrigin } from "@/lib/site-url";
import { countryLabel, industryLabel } from "@/lib/tender-labels";
import type { TenderListItem } from "@/lib/tender-list-page";
import type { PublicTenderDetail } from "@/types/tender";

function JsonLd({ value }: { value: object }) {
  // Tender copy comes from external procurement systems. Escaping `<` keeps
  // a malicious source string from closing the script element in HTML.
  const serialized = JSON.stringify(value).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}

/** Public, non-paywalled facts for one tender page. */
export function TenderStructuredData({ tender }: { tender: PublicTenderDetail }) {
  const origin = siteOrigin();
  const url = `${origin}/tenders/${tender.publicSlug}`;
  const country = countryLabel(tender.country, "zh");

  return (
    <JsonLd value={{
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          url,
          name: `${tender.titleZh}｜${country}政府招标`,
          description: tender.summaryZh,
          inLanguage: "zh-CN",
          datePublished: tender.publicationDate,
          isPartOf: { "@id": `${origin}/#website` },
          publisher: { "@id": `${origin}/#organization` },
          about: [
            { "@type": "Country", name: country },
            ...tender.industries.map((industry) => ({
              "@type": "DefinedTerm",
              name: industryLabel(industry, "zh"),
            })),
          ],
          breadcrumb: { "@id": `${url}#breadcrumb` },
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${url}#breadcrumb`,
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "首页", item: origin },
            { "@type": "ListItem", position: 2, name: "招标项目", item: `${origin}/tenders` },
            { "@type": "ListItem", position: 3, name: tender.titleZh, item: url },
          ],
        },
      ],
    }} />
  );
}

/** Links the server-rendered result cards into one discoverable item list. */
export function TenderListStructuredData({ tenders }: { tenders: TenderListItem[] }) {
  const origin = siteOrigin();

  return (
    <JsonLd value={{
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "拉美政府招标项目",
      itemListElement: tenders.map((tender, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tender.titleZh,
        url: `${origin}/tenders/${tender.publicSlug}`,
      })),
    }} />
  );
}
