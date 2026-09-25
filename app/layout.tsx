import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CookieNotice } from "@/components/layout/CookieNotice";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { DeviceGuard } from "@/components/account/DeviceGuard";
import { siteOrigin } from "@/lib/site-url";
import { SITE_DESCRIPTION, siteVerification } from "@/lib/seo";
import { StructuredData } from "@/components/seo/StructuredData";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The product is Chinese-only on the frontend (see lib/i18n.tsx) — this
// isn't LocalizedText-driven like the rest of the UI copy, so it has to be
// kept in step BY HAND with the brand copy a visitor actually reads:
// components/tenders/HomeHero.tsx and components/layout/{Header,Footer}.tsx.
// It drifted once already — those three said 拉美 while this still said
// 墨西哥 only, long after Colombia and Peru were live.
//
// The countries are named rather than rolled up into 拉美 because that is
// what people search for; when the next connector ships, this list and
// AVAILABLE_COUNTRIES (lib/tender-list-page.ts) both need the addition.
// Brazil was the fourth (2026-09-19) and proved the warning above: its PNCP
// connector had been importing for three days while every one of those rows
// stayed invisible, because AVAILABLE_COUNTRIES had not been touched.
export const metadata: Metadata = {
  // Absolute base for canonical URLs and any relative metadata a page sets;
  // without it Next warns and emits relative canonicals, which crawlers
  // resolve against whatever host served the page — including preview hosts.
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "拉美招投标信息平台 | 中国企业出海墨西哥、巴西、哥伦比亚、秘鲁、智利",
    // Every page below sets a short, page-specific title; this keeps the
    // brand on the end of it so search results stay attributable without
    // each page repeating it.
    template: "%s | 拉美招投标信息平台",
  },
  description:
    SITE_DESCRIPTION,
  // Use stable, explicit URLs instead of relying only on Next's generated
  // file-metadata URLs. Google may keep a search-result favicon cached for
  // days or weeks, so the hostname should always advertise one canonical
  // square brand image at the same address across deployments.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  // Without these, a link pasted into WeChat, 企业微信, Slack or anywhere else
  // renders as a bare URL — no title, no description, no image. For a B2B
  // product that spreads by being forwarded to a colleague, that costs more
  // than any ranking factor on this page. The image itself is
  // app/opengraph-image.png, picked up by file convention; Twitter falls back
  // to og:image, so one file covers both.
  openGraph: {
    type: "website",
    siteName: "拉美招投标信息平台",
    locale: "zh_CN",
    url: siteOrigin(),
    title: "拉美招投标信息平台 | 中国企业出海墨西哥、巴西、哥伦比亚、秘鲁、智利",
    description:
      SITE_DESCRIPTION,
  },
  // Baidu, 360 and Sogou still read this; Google ignores it. Kept to the
  // phrases a Chinese buyer actually types, brand first — the site did not
  // come up for its own name (user, 2026-09-25: 拉美招投标信息平台 好像搜不到我们).
  keywords: [
    "拉美招投标信息平台",
    "拉美招标",
    "拉美招投标",
    "拉美政府采购",
    "墨西哥招标",
    "巴西招标",
    "哥伦比亚招标",
    "秘鲁招标",
    "智利招标",
    "LatinTender",
  ],
  // Search-console ownership tags, read from the environment so a code for
  // Google, Bing, Baidu, 360 or Sogou is pasted into Vercel rather than
  // committed. An unset variable emits nothing. Baidu in particular will not
  // take a sitemap or an API push until the site is verified.
  verification: siteVerification(),
  twitter: {
    card: "summary_large_image",
    title: "拉美招投标信息平台",
    description: "拉美五国政府及国有石油、电力、矿业公司招标采购信息，一站式中文平台。覆盖墨西哥、巴西、哥伦比亚、秘鲁、智利。",
  },
  // NO `alternates` here, deliberately. Metadata fields are inherited WHOLE by
  // any route that does not set its own (Next's own docs: "All openGraph
  // fields from app/layout.js are inherited in app/about/page.js because
  // app/about/page.js doesn't set openGraph metadata"). A canonical of "/" on
  // this layout therefore made every page without its own alternates —
  // /pricing, /guides and each guide, /tenders, the policy pages — declare
  // itself a duplicate of the homepage, which tells a crawler to index the
  // homepage INSTEAD of them. The 参标指南 pages (fourteen as of 2026-09-25) are the only real
  // long-tail content this site has, and they were signing themselves away
  // (found 2026-09-14, while asking why the site could not be found at all).
  //
  // Every indexable page now names its own canonical. scripts/test-canonical-
  // urls.ts fails the build if a new one forgets.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StructuredData />
        <LocaleProvider>
          <AnalyticsTracker />
          <DeviceGuard />
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
          <CookieNotice />
        </LocaleProvider>
      </body>
    </html>
  );
}
