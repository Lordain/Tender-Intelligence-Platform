import { siteOrigin } from "@/lib/site-url";
import { SITE_DESCRIPTION } from "@/lib/seo";

/**
 * Organization + WebSite, as JSON-LD.
 *
 * What this buys, concretely: searching the brand name can return a site name
 * and sitelinks rather than a bare blue link, and the name a search engine
 * shows is the one declared here instead of one guessed from the <title>.
 * Neither happens without an explicit declaration.
 *
 * Deliberately narrow. Organization and WebSite describe the site itself and
 * are true on every page. A Product/Offer block for the plans belongs on
 * /pricing, where the prices actually live, and the tender pages are mostly
 * behind a paywall — marking those up as freely readable content would be the
 * kind of structured-data claim that earns a manual action rather than a rich
 * result.
 *
 * Rendered as a <script> rather than through metadata because Next's Metadata
 * API carries no JSON-LD field; this is the documented approach.
 */
export function StructuredData() {
  const origin = siteOrigin();

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "拉美招投标信息平台",
        alternateName: "Latin Tender",
        url: origin,
        // A square brand mark is a better organization identity than the
        // wide social-share cover. Search-result favicons are controlled by
        // <link rel="icon">, but keeping structured data aligned avoids a
        // second, conflicting visual identity for other Google surfaces.
        logo: `${origin}/apple-icon.png`,
        description:
          SITE_DESCRIPTION,
        areaServed: [
          { "@type": "Country", name: "Mexico" },
          { "@type": "Country", name: "Brazil" },
          { "@type": "Country", name: "Colombia" },
          { "@type": "Country", name: "Peru" },
          { "@type": "Country", name: "Chile" },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: "拉美招投标信息平台",
        inLanguage: "zh-CN",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Built from constants and siteOrigin(), never from user input, so
      // there is nothing here for a viewer to inject into.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
