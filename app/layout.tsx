import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { siteOrigin } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The product is Chinese-only on the frontend (see lib/i18n.tsx) — this
// isn't LocalizedText-driven like the rest of the UI copy, so it needs to
// be kept in sync with lib/localize.ts's uiText.heroTitle/heroSubtitle by
// hand.
export const metadata: Metadata = {
  // Absolute base for canonical URLs and any relative metadata a page sets;
  // without it Next warns and emits relative canonicals, which crawlers
  // resolve against whatever host served the page — including preview hosts.
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "拉美招投标平台 | 中国企业出海墨西哥",
    // Every page below sets a short, page-specific title; this keeps the
    // brand on the end of it so search results stay attributable without
    // each page repeating it.
    template: "%s | 拉美招投标平台",
  },
  description:
    "把墨西哥政府招标信息转化为结构化的中文情报，帮中国企业快速判断能不能投、该不该投，专注大型/中型项目。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          <AnalyticsTracker />
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
