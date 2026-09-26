/**
 * Checks the traffic-source classification and the acquisition funnel on
 * /admin/analytics (lib/analytics-source.ts, lib/analytics-funnel.ts).
 * Offline: no browser, no database.
 */
import { classifyTrafficSource, cleanReferrerHost, inAppBrowser, landingPageGroup, sanitizeEntryProperties } from "../lib/analytics-source";
import { buildAcquisitionFunnel, type FunnelPageView } from "../lib/analytics-funnel";

let failures = 0;
let checks = 0;
function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

// --- What the events route keeps -------------------------------------------
check("no entry mark keeps nothing", sanitizeEntryProperties({ referrer: "www.baidu.com" }, null), {});
check("entry keeps cleaned fields", sanitizeEntryProperties({ entry: true, referrer: "WWW.Baidu.com.", utmSource: " wechat ", utmCampaign: "周报-09", extra: "x" }, null), { entry: true, referrer: "www.baidu.com", utmSource: "wechat", utmCampaign: "周报-09" });
check("own host is not a referrer", cleanReferrerHost("www.latintender.com"), undefined);
check("a URL is not a host", cleanReferrerHost("https://www.baidu.com/s?wd=x"), undefined);
check("localhost is not a host", cleanReferrerHost("localhost"), undefined);
check("markup in a tag is dropped", sanitizeEntryProperties({ entry: true, utmSource: "<script>" }, null), { entry: true });
check("long tag is cut, not dropped", (sanitizeEntryProperties({ entry: true, utmSource: "a".repeat(300) }, null) as { utmSource?: string }).utmSource?.length, 100);
check("non-string referrer ignored", sanitizeEntryProperties({ entry: true, referrer: 42 }, null), { entry: true });
check("WeChat in-app browser", inAppBrowser("Mozilla/5.0 (iPhone) AppleWebKit MicroMessenger/8.0.49"), "wechat");
check("LinkedIn in-app browser", inAppBrowser("Mozilla/5.0 LinkedInApp"), "linkedin");
check("ordinary browser", inAppBrowser("Mozilla/5.0 Chrome/140"), undefined);
check("in-app flag stored", sanitizeEntryProperties({ entry: true }, "MicroMessenger/8.0"), { entry: true, inApp: "wechat" });

// --- Classification ---------------------------------------------------------
const key = (properties: Record<string, unknown> | null) => classifyTrafficSource(properties).key;
check("before tracking", key({}), "unrecorded");
check("null properties", key(null), "unrecorded");
check("direct", key({ entry: true }), "direct");
check("baidu mobile", key({ entry: true, referrer: "m.baidu.com" }), "baidu");
check("google country domain", key({ entry: true, referrer: "www.google.com.mx" }), "google");
check("gemini is AI not Google", key({ entry: true, referrer: "gemini.google.com" }), "ai_assistant");
check("doubao", key({ entry: true, referrer: "www.doubao.com" }), "ai_assistant");
check("deepseek", key({ entry: true, referrer: "chat.deepseek.com" }), "ai_assistant");
check("bing china", key({ entry: true, referrer: "cn.bing.com" }), "bing");
check("sogou", key({ entry: true, referrer: "www.sogou.com" }), "other_search");
check("wechat article", key({ entry: true, referrer: "mp.weixin.qq.com" }), "wechat");
check("linkedin", key({ entry: true, referrer: "www.linkedin.com" }), "linkedin");
check("zhihu is social", key({ entry: true, referrer: "www.zhihu.com" }), "social");
check("webmail", key({ entry: true, referrer: "mail.qq.com" }), "email");
check("unknown site", classifyTrafficSource({ entry: true, referrer: "www.camexico.org" }), { key: "referral", detail: "www.camexico.org" });
check("notbaidu.com is not baidu", key({ entry: true, referrer: "notbaidu.com" }), "referral");
check("tag beats referrer", key({ entry: true, utmSource: "wechat", referrer: "www.google.com" }), "wechat");
check("unknown tag", classifyTrafficSource({ entry: true, utmSource: "chamber-newsletter" }), { key: "tagged", detail: "chamber-newsletter" });
check("in-app wechat without referrer", key({ entry: true, inApp: "wechat" }), "wechat");
check("referrer beats in-app", key({ entry: true, inApp: "wechat", referrer: "www.baidu.com" }), "baidu");

// --- Landing groups ---------------------------------------------------------
check("home", landingPageGroup("/"), "首页");
check("list", landingPageGroup("/tenders"), "项目列表");
check("list with query", landingPageGroup("/tenders?country=Mexico"), "项目列表");
check("detail", landingPageGroup("/tenders/abc-123"), "项目详情页");
check("guide article", landingPageGroup("/guides/pemex"), "参与指南文章");
check("country page", landingPageGroup("/countries/mexico"), "国家项目页");
check("empty path", landingPageGroup(null), "首页");

// --- Funnel -----------------------------------------------------------------
let clock = Date.parse("2026-09-27T00:00:00Z");
const view = (session: string, path: string, properties: Record<string, unknown> = {}, user: string | null = null): FunnelPageView => ({
  session_id: session, user_id: user, path, properties, created_at: new Date((clock += 1000)).toISOString(),
});
const rows = [
  view("a", "/", { entry: true, referrer: "www.baidu.com" }),
  view("b", "/tenders/x", { entry: true, utmSource: "wechat" }),
  view("a", "/tenders"),
  view("a", "/tenders/y"),
  view("a", "/register"),
  view("a", "/account", {}, "user-a"),
  view("c", "/"),
  view("d", "/guides/pemex", { entry: true, referrer: "www.baidu.com" }),
  view("b", "/pricing"),
  // A visitor first seen before source tracking, back afterwards from Google.
  view("e", "/"),
  view("e", "/tenders", { entry: true, referrer: "www.google.com" }),
];
const funnel = buildAcquisitionFunnel(rows, [
  { userId: "user-a", createdAt: "2026-09-27T00:00:06Z" },
  { userId: "user-z", createdAt: "2026-09-27T00:00:07Z" },
]);
check("visitors", funnel.visitors, 5);
check("stages", funnel.stages.map((stage) => [stage.key, stage.count]), [["visitors", 5], ["engaged", 3], ["detail", 2], ["pricing", 1], ["register", 1], ["signup", 2]]);
check("unlinked signup", funnel.unlinkedSignups, 1);
const source = (name: string) => funnel.sources.find((row) => row.key === name);
check("baidu row", source("baidu") && { v: source("baidu")!.visitors, e: source("baidu")!.engaged, d: source("baidu")!.detail, r: source("baidu")!.register, s: source("baidu")!.signups, x: source("baidu")!.examples }, { v: 2, e: 1, d: 1, r: 1, s: 1, x: ["www.baidu.com"] });
check("wechat row", source("wechat")?.visitors, 1);
check("returning visitor takes its later entry", source("google")?.visitors, 1);
check("no entry at all is unrecorded", source("unrecorded")?.visitors, 1);
check("sources sorted by visitors", funnel.sources[0]?.key, "baidu");
check("landing groups", funnel.landings.map((row) => [row.page, row.visitors, row.singlePage]), [["首页", 3, 1], ["参与指南文章", 1, 1], ["项目详情页", 1, 0]]);
// Our own accounts: their sign-ups go, and so does every browser signed in to one.
const withOwn = buildAcquisitionFunnel(rows, [
  { userId: "user-a", createdAt: "2026-09-27T00:00:06Z" },
  { userId: "user-z", createdAt: "2026-09-27T00:00:07Z" },
], new Set(["user-a", "user-z"]));
check("own browser dropped", withOwn.visitors, 4);
check("own sign-ups dropped", [withOwn.signups, withOwn.unlinkedSignups], [0, 0]);
check("own browser's source dropped", withOwn.sources.find((row) => row.key === "baidu")?.visitors, 1);
check("register stage drops with it", withOwn.stages.find((stage) => stage.key === "register")?.count, 0);
const empty = buildAcquisitionFunnel([], []);
check("empty funnel", [empty.visitors, empty.sources.length, empty.landings.length, empty.stages.every((stage) => stage.count === 0)], [0, 0, 0, true]);

console.log(`${checks - failures}/${checks} analytics-source checks passed`);
if (failures > 0) process.exit(1);
