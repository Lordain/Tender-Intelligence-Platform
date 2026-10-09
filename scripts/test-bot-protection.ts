/**
 * The /tenders anti-scraping rules: people at 40 a minute per address,
 * scraping libraries refused, search engines and link previews at 300 a
 * minute per address — a script claiming to be Googlebot no longer goes
 * unlimited (2026-10-09 audit).
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { evaluateBotProtection } from "../lib/security/bot-protection";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function request(path: string, userAgent: string, ip: string): NextRequest {
  return new NextRequest(`https://latintender.com${path}`, { headers: { "user-agent": userAgent, "x-forwarded-for": ip } });
}

function statuses(path: string, userAgent: string, ip: string, times: number): (number | null)[] {
  return Array.from({ length: times }, () => evaluateBotProtection(request(path, userAgent, ip))?.status ?? null);
}

// Pages outside /tenders are never touched.
assert.equal(evaluateBotProtection(request("/", "python-requests/2.32", "10.0.0.1")), null);
assert.equal(evaluateBotProtection(request("/pricing", "", "10.0.0.1")), null);

// Scraping libraries and an empty user agent are refused on /tenders.
assert.equal(evaluateBotProtection(request("/tenders", "python-requests/2.32", "10.0.0.2"))?.status, 403);
assert.equal(evaluateBotProtection(request("/tenders/x", "", "10.0.0.2"))?.status, 403);

// A person: 40 a minute, the 41st is 429 with Retry-After.
const person = statuses("/tenders", BROWSER, "10.0.0.3", 41);
assert.ok(person.slice(0, 40).every((status) => status === null));
assert.equal(person[40], 429);
assert.equal(evaluateBotProtection(request("/tenders", BROWSER, "10.0.0.3"))?.headers.get("retry-after"), "60");

// A crawler: well past the people's 40, stopped only after 300.
const crawler = statuses("/tenders/a", GOOGLEBOT, "10.0.0.4", 301);
assert.ok(crawler.slice(0, 300).every((status) => status === null));
assert.equal(crawler[300], 429);

// Counters are per address: another Googlebot address is unaffected.
assert.equal(evaluateBotProtection(request("/tenders/a", GOOGLEBOT, "10.0.0.5")), null);
// WeChat link previews share the crawler allowance.
assert.ok(statuses("/tenders/b", "Mozilla/5.0 MicroMessenger/8.0", "10.0.0.6", 100).every((status) => status === null));

console.log("bot-protection: all checks passed");
