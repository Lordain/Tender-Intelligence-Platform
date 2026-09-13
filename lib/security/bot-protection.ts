import { NextResponse, type NextRequest } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/security/rate-limit";

/**
 * Moderate anti-scraping for the tender list/detail pages — the only pages
 * exposing bulk structured data worth mass-copying. Deliberately scoped so
 * search engines keep full, unthrottled access (2026-09-05, user explicitly
 * chose "保留SEO，中等防护" over blocking anonymous access outright).
 */
const PROTECTED_PATH_PATTERN = /^\/tenders(\/|$)/;

/**
 * Major search engines and link-preview bots we never rate-limit or block.
 *
 * The Chinese ones are not an afterthought here — this product's customers
 * are Chinese enterprises, so Baidu, Sogou, 360, Shenma (YisouSpider, the
 * UC/Alibaba engine that matters on mobile) and Bytedance's Bytespider are
 * the engines that actually reach the buyer. The first three were already
 * listed; the last two were not, and fell through to the 40-requests-a-minute
 * limiter below, which is restrictive for something crawling a whole site.
 *
 * MicroMessenger is in the list for a different reason: WeChat fetches a
 * shared link to build its preview card, and those fetches come from pooled
 * Tencent addresses rather than the person who shared it. A tender link doing
 * the rounds inside a company could put that shared address over the limit
 * and turn every subsequent preview into a 429 — the exact moment the link is
 * spreading is the moment it would stop rendering.
 */
const ALLOWED_CRAWLER_UA =
  /googlebot|bingbot|baiduspider|sogou|360spider|yisouspider|bytespider|micromessenger|yandexbot|duckduckbot|applebot|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp/i;

// Generic HTTP-client/scraping-library signatures. Real browsers never send
// these, so blocking them costs no real visitors or SEO — this is the "did
// someone write a script against our site" signal, not a crawler-policy call.
const SCRAPER_UA_PATTERN =
  /python-requests|python-urllib|scrapy|curl\/|wget\/|libwww-perl|go-http-client|okhttp|node-fetch|^axios\/|postmanruntime|aiohttp|^java\/|phantomjs/i;

/** See lib/security/rate-limit.ts for what this does and does not cover. */
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 40 });

export function evaluateBotProtection(request: NextRequest): NextResponse | null {
  if (!PROTECTED_PATH_PATTERN.test(request.nextUrl.pathname)) return null;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (ALLOWED_CRAWLER_UA.test(userAgent)) return null;

  if (!userAgent || SCRAPER_UA_PATTERN.test(userAgent)) {
    return new NextResponse("Access denied.", { status: 403 });
  }

  const ip = clientIp(request);
  if (ip !== "unknown" && isRateLimited(ip)) {
    return new NextResponse("请求过于频繁，请稍后再试。", {
      status: 429,
      headers: { "Retry-After": "60", "content-type": "text/plain; charset=utf-8" },
    });
  }

  return null;
}
