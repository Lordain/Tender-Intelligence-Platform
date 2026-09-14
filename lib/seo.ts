import type { Metadata } from "next";

/**
 * One page's metadata, built so the three things that must agree cannot drift
 * apart: the title, the canonical URL, and what a share card says.
 *
 * Both problems this solves came from the same place — Next inherits a
 * metadata field WHOLE into any route that does not set its own.
 *
 *   - A canonical of "/" on the root layout made every page declare itself a
 *     duplicate of the homepage (fixed 2026-09-14; see app/layout.tsx).
 *   - No page set `openGraph`, so all of them inherited the homepage's
 *     og:title and og:description. Every guide, the pricing page and each
 *     policy page produced an identical card when forwarded — and this is a
 *     B2B product that travels by being pasted into WeChat and 企业微信,
 *     which the root layout's own comment calls out as mattering more than
 *     any ranking factor.
 *
 * Two behaviours of Next's own resolver this depends on, both verified
 * against its source rather than recalled (node_modules/next/dist/lib/
 * metadata/resolvers/resolve-opengraph.js):
 *
 *   1. Setting `openGraph` on a page REPLACES the layout's whole object —
 *      fields are not merged. So siteName, locale and type are restated here;
 *      omitting them drops them from the page entirely.
 *   2. `openGraph.title` IS run through the root's `title.template`, so the
 *      bare title goes in. Passing "X | 拉美招投标信息平台" would render the
 *      brand twice.
 */
const BRAND = "拉美招投标信息平台";

export function pageMetadata({
  title,
  description,
  /** Path only, e.g. "/guides/peru-seace-oece" — resolved against metadataBase. */
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: BRAND,
      locale: "zh_CN",
      url: path,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
