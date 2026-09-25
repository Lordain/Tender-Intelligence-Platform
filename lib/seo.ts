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

/**
 * The site description every metadata surface shares — the root layout's
 * <meta>, Open Graph, and the Organization JSON-LD. One constant so the three
 * cannot drift; they had been three hand-kept copies.
 *
 * The footer's approved copy (user, 2026-09-20) plus one clause, added when
 * the state oil, power and mining companies' own portals joined the
 * government platforms (2026-09-25: 请基于最新状态同步刷新Metadata和SEO) —
 * Petrobras, Pemex, CFE, Cemig, Codelco, Petroperú and UPME's transmission
 * calls are a large part of what a searcher for 拉美 石油/电力/矿业 招标 wants.
 */
export const SITE_DESCRIPTION =
  "专注于拉美五国政府招标采购信息，一站式中文平台。覆盖墨西哥、巴西、哥伦比亚、秘鲁、智利，汇集各官方采购平台及国家石油、电力、矿业公司采购门户，中文翻译，人工精筛，按国家、行业、项目规模筛选。帮企业省时、省力、省钱，快速获取精准拉美项目机会。";

export function pageMetadata({
  title,
  description,
  /** Path only, e.g. "/guides/peru-seace-oece" — resolved against metadataBase. */
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
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
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
