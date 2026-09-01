import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getAllTenders } from "@/lib/tenders";

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
  title: "招投标情报平台 | 中国企业出海墨西哥",
  description:
    "把墨西哥政府招标信息转化为结构化的中文情报，帮中国企业快速判断能不能投、该不该投，专注大型/重点项目。",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tenders = await getAllTenders();

  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          <Header tenders={tenders} />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
