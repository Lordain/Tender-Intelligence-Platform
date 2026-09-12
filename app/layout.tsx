import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CookieNotice } from "@/components/layout/CookieNotice";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { siteOrigin } from "@/lib/site-url";
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
// The three countries are named rather than rolled up into 拉美 because
// that is what people search for; when a fourth connector ships, this list
// and AVAILABLE_COUNTRIES (lib/tender-list-page.ts) both need the addition.
export const metadata: Metadata = {
  // Absolute base for canonical URLs and any relative metadata a page sets;
  // without it Next warns and emits relative canonicals, which crawlers
  // resolve against whatever host served the page — including preview hosts.
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "拉美招投标信息平台 | 中国企业出海墨西哥、哥伦比亚、秘鲁",
    // Every page below sets a short, page-specific title; this keeps the
    // brand on the end of it so search results stay attributable without
    // each page repeating it.
    template: "%s | 拉美招投标信息平台",
  },
  description:
    "把墨西哥、哥伦比亚、秘鲁的政府招标信息转化为结构化的中文情报，帮中国企业快速判断能不能投、该不该投，专注大型/中型项目。",
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
    title: "拉美招投标信息平台 | 中国企业出海墨西哥、哥伦比亚、秘鲁",
    description:
      "把墨西哥、哥伦比亚、秘鲁的政府招标信息转化为结构化的中文情报，帮中国企业快速判断能不能投、该不该投。",
  },
  twitter: {
    card: "summary_large_image",
    title: "拉美招投标信息平台",
    description: "墨西哥、哥伦比亚、秘鲁的政府招标信息，结构化中文情报。",
  },
  alternates: { canonical: "/" },
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
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
          <CookieNotice />
        </LocaleProvider>
      </body>
    </html>
  );
}
