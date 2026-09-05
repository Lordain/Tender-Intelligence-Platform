import { NextResponse, type NextRequest } from "next/server";

/**
 * Moderate anti-scraping for the tender list/detail pages — the only pages
 * exposing bulk structured data worth mass-copying. Deliberately scoped so
 * search engines keep full, unthrottled access (2026-09-05, user explicitly
 * chose "保留SEO，中等防护" over blocking anonymous access outright).
 */
const PROTECTED_PATH_PATTERN = /^\/tenders(\/|$)/;

// Major search engines and link-preview bots we never rate-limit or block.
const ALLOWED_CRAWLER_UA =
  /googlebot|bingbot|baiduspider|sogou|360spider|yandexbot|duckduckbot|applebot|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp/i;

// Generic HTTP-client/scraping-library signatures. Real browsers never send
// these, so blocking them costs no real visitors or SEO — this is the "did
// someone write a script against our site" signal, not a crawler-policy call.
const SCRAPER_UA_PATTERN =
  /python-requests|python-urllib|scrapy|curl\/|wget\/|libwww-perl|go-http-client|okhttp|node-fetch|^axios\/|postmanruntime|aiohttp|^java\/|phantomjs/i;

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 40;

/**
 * Per-instance sliding-window counters. This resets on redeploy/cold start
 * and isn't shared across serverless instances, so it won't stop a
 * distributed scrape — but it blunts the common case (one IP/script hammering
 * every tender detail page) without adding a Redis/Upstash dependency that
 * hasn't been provisioned for this project.
 */
const requestLog = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);

  if (requestLog.size > 5000) {
    for (const [key, timestamps] of requestLog) {
      if (timestamps.every((ts) => now - ts >= WINDOW_MS)) requestLog.delete(key);
    }
  }

  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

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
