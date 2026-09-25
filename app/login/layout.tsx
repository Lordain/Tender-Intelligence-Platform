import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * /login exists so this file can.
 *
 * `app/login/page.tsx` is a Client Component, and Next only reads a `metadata`
 * export from a Server Component ("The `metadata` object and `generateMetadata`
 * function exports are only supported in Server Components" —
 * node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md).
 * So the page could not name its own canonical no matter who remembered to,
 * and it inherited the root layout's title and description verbatim.
 *
 * That is what Google reported on 2026-09-21 as 「重複網頁；使用者未選取標準
 * 網頁」: a crawlable page carrying someone else's title and no canonical of
 * its own is, to a crawler, a copy of whatever it is copying. /login and
 * /register were the two, and they are the two pages robots.ts allows ON
 * PURPOSE — "a person searching for the product by name should be able to
 * land on them" — so the fix is to let them be themselves, not to hide them.
 *
 * They stay out of app/sitemap.ts, which is a separate decision and still the
 * right one: the sitemap offers content, and these are forms.
 *
 * Renders `children` and nothing else. No wrapper, no element, no class — the
 * page's own markup reaches the DOM exactly as before.
 */
export const metadata: Metadata = pageMetadata({
  title: "登录",
  description: "登录拉美招投标信息平台，查看墨西哥、巴西、哥伦比亚、秘鲁、智利政府招标项目的中文情报、采购方信息与交标时间。",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
