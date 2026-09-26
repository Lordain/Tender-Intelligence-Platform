/**
 * Where a visit came from, for the acquisition funnel on /admin/analytics.
 *
 * The browser sends, on the first page view of each page load only, the
 * host of a cross-site referrer and any utm_* tags on the landing URL
 * (components/analytics/AnalyticsTracker.tsx). The events route keeps just
 * those, cleaned by sanitizeEntryProperties(), plus an in-app browser flag
 * it reads from the User-Agent — WeChat usually sends no referrer at all, so
 * without the flag every visit from a shared WeChat link would read as
 * 直接访问. Nothing here stores a full URL, a path on the other site or an
 * IP address.
 *
 * Pure on purpose: scripts/test-analytics-source.ts runs it without a
 * browser or a database.
 */

export type EntryProperties = {
  entry: true;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  inApp?: "wechat" | "linkedin";
};

export type TrafficSourceKey =
  | "baidu"
  | "google"
  | "bing"
  | "other_search"
  | "wechat"
  | "linkedin"
  | "ai_assistant"
  | "social"
  | "email"
  | "tagged"
  | "referral"
  | "direct"
  | "unrecorded";

export const TRAFFIC_SOURCE_LABELS: Record<TrafficSourceKey, string> = {
  baidu: "百度",
  google: "Google",
  bing: "必应",
  other_search: "其他搜索引擎",
  wechat: "微信",
  linkedin: "领英",
  ai_assistant: "AI 助手（豆包、DeepSeek、ChatGPT 等）",
  social: "其他社交平台",
  email: "邮件",
  tagged: "带标记的推广链接",
  referral: "其他网站链接",
  direct: "直接访问 / 来源未知",
  unrecorded: "未记录（来源统计上线前）",
};

/** Our own hosts: a referrer from these is an internal navigation, not a source. */
const OWN_HOSTS = new Set(["latintender.com", "www.latintender.com"]);

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$/;
/** Tag values are free text chosen by whoever wrote the link; keep them short and printable. */
const TAG_PATTERN = /^[\p{L}\p{N} ._+\-:/]{1,100}$/u;

function cleanTag(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 100);
  return TAG_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function cleanReferrerHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (host.length > 253 || !HOST_PATTERN.test(host) || OWN_HOSTS.has(host)) return undefined;
  return host;
}

export function inAppBrowser(userAgent: string | null | undefined): EntryProperties["inApp"] {
  if (!userAgent) return undefined;
  if (/MicroMessenger/i.test(userAgent)) return "wechat";
  if (/LinkedInApp/i.test(userAgent)) return "linkedin";
  return undefined;
}

/**
 * What the events route stores for a page view: nothing unless the browser
 * marked it as the page load's entry, and then only the cleaned fields.
 */
export function sanitizeEntryProperties(raw: Record<string, unknown>, userAgent: string | null): EntryProperties | Record<string, never> {
  if (raw.entry !== true) return {};
  const properties: EntryProperties = { entry: true };
  const referrer = cleanReferrerHost(raw.referrer);
  if (referrer) properties.referrer = referrer;
  const utmSource = cleanTag(raw.utmSource);
  const utmMedium = cleanTag(raw.utmMedium);
  const utmCampaign = cleanTag(raw.utmCampaign);
  if (utmSource) properties.utmSource = utmSource;
  if (utmMedium) properties.utmMedium = utmMedium;
  if (utmCampaign) properties.utmCampaign = utmCampaign;
  const inApp = inAppBrowser(userAgent);
  if (inApp) properties.inApp = inApp;
  return properties;
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const AI_ASSISTANT_DOMAINS = [
  "doubao.com",
  "deepseek.com",
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "kimi.com",
  "kimi.moonshot.cn",
  "yuanbao.tencent.com",
  "tongyi.aliyun.com",
  "qianwen.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
];
const OTHER_SEARCH_DOMAINS = ["sogou.com", "so.com", "sm.cn", "yandex.com", "yandex.ru", "duckduckgo.com", "yahoo.com", "ecosia.org", "naver.com"];
const SOCIAL_DOMAINS = ["facebook.com", "fb.com", "t.co", "x.com", "twitter.com", "instagram.com", "youtube.com", "reddit.com", "weibo.com", "zhihu.com", "douyin.com", "xiaohongshu.com", "whatsapp.com", "telegram.org", "t.me"];

function sourceFromTag(tag: string): TrafficSourceKey | null {
  const value = tag.toLowerCase();
  if (["wechat", "weixin", "wx", "微信"].includes(value)) return "wechat";
  if (["linkedin", "领英"].includes(value)) return "linkedin";
  if (["baidu", "百度"].includes(value)) return "baidu";
  if (value === "google") return "google";
  if (["email", "mail", "newsletter", "digest", "邮件"].includes(value)) return "email";
  return null;
}

/** The referrer's own classification, or null for a site that fits no group. */
function sourceFromHost(host: string): TrafficSourceKey | null {
  // AI assistants first: gemini.google.com must not read as Google search.
  if (AI_ASSISTANT_DOMAINS.some((domain) => hostIs(host, domain))) return "ai_assistant";
  if (hostIs(host, "baidu.com")) return "baidu";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (hostIs(host, "bing.com")) return "bing";
  if (OTHER_SEARCH_DOMAINS.some((domain) => hostIs(host, domain))) return "other_search";
  if (hostIs(host, "weixin.qq.com") || hostIs(host, "wx.qq.com")) return "wechat";
  if (hostIs(host, "linkedin.com") || hostIs(host, "lnkd.in")) return "linkedin";
  if (SOCIAL_DOMAINS.some((domain) => hostIs(host, domain))) return "social";
  if (/(^|\.)(mail|webmail|outlook|exmail)\./.test(host) || hostIs(host, "outlook.live.com")) return "email";
  return null;
}

/**
 * One visit's source. A utm_source tag wins over the referrer, because a tag
 * is how a link we shared says where it was posted; after that the referrer;
 * then the in-app browser; then direct. A page view without the entry mark
 * was recorded before this existed and is reported as such, never as direct.
 */
export function classifyTrafficSource(properties: Record<string, unknown> | null | undefined): { key: TrafficSourceKey; detail: string | null } {
  if (!properties || properties.entry !== true) return { key: "unrecorded", detail: null };
  const utmSource = typeof properties.utmSource === "string" ? properties.utmSource : null;
  const referrer = typeof properties.referrer === "string" ? properties.referrer : null;
  if (utmSource) return { key: sourceFromTag(utmSource) ?? "tagged", detail: utmSource };
  if (referrer) return { key: sourceFromHost(referrer) ?? "referral", detail: referrer };
  if (properties.inApp === "wechat") return { key: "wechat", detail: "微信内打开" };
  if (properties.inApp === "linkedin") return { key: "linkedin", detail: "领英内打开" };
  return { key: "direct", detail: null };
}

/** Landing pages grouped by kind, so 400 tender slugs read as one row. */
export function landingPageGroup(path: string | null | undefined): string {
  const value = (path ?? "").split("?")[0] || "/";
  if (value === "/") return "首页";
  const rules: [RegExp, string][] = [
    [/^\/tenders\/?$/, "项目列表"],
    [/^\/tenders\/.+/, "项目详情页"],
    [/^\/countries\/?$/, "国家页（总览）"],
    [/^\/countries\/.+/, "国家项目页"],
    [/^\/guides\/?$/, "参与指南（总览）"],
    [/^\/guides\/.+/, "参与指南文章"],
    [/^\/insights\/?$/, "国家洞察（总览）"],
    [/^\/insights\/.+/, "国家洞察文章"],
    [/^\/industries(\/.*)?$/, "行业页"],
    [/^\/weekly(\/.*)?$/, "周报"],
    [/^\/reports(\/.*)?$/, "报告"],
    [/^\/pricing/, "价格页"],
    [/^\/register/, "注册页"],
    [/^\/login/, "登录页"],
  ];
  for (const [pattern, label] of rules) if (pattern.test(value)) return label;
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}
