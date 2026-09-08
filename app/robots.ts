import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site-url";

/**
 * /saved and /notifications joined the disallow list once app/sitemap.ts
 * existed to make the distinction meaningful: both are signed-in-only views
 * that render nothing useful to a crawler. /login and /register stay
 * crawlable — a person searching for the product by name should be able to
 * land on them — but neither is in the sitemap, since they are forms rather
 * than content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/api", "/auth", "/saved", "/notifications"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
