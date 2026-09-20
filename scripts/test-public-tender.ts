import { toPublicTenderDetail } from "../lib/public-tender";
import { toNotificationTender, toTenderListItem } from "../lib/tender-list-page";
import { toTenderCardData } from "../lib/tender-card";
import { publicTenderPath } from "../lib/public-tender-url";
import { GENERIC_PUBLIC_SUMMARY } from "../lib/public-title";
import type { Tender } from "../types/tender";

const fullTender = {
  id: "SECRET_INTERNAL_ID",
  slug: "SECRET_SOURCE_DERIVED_SLUG",
  publicSlug: "p-7a3c91e4b6d82f05",
  tenderNumber: "SECRET_TENDER_CODE",
  title: { zh: "SECRET_PLACE_NAME变电站扩建工程", es: "SECRET_ORIGINAL_TITLE", en: "English title" },
  titleZhPublic: "墨西哥 变电站扩建工程（输配电）",
  titleZhShort: "SECRET_PLACE_NAME变电站扩建",
  summary: { zh: "SECRET_SUMMARY_PLACE的变电站扩建工程", es: "Resumen", en: "Summary" },
  summaryZhPublic: "配电变电站的扩建工程，包含开关柜安装与配套土建施工。",
  oneLineSummary: "SECRET_ONE_LINE_SUMMARY",
  buyer: "采购单位",
  country: "Mexico",
  governmentLevel: "federal",
  industries: ["energy"],
  scopeType: "equipment",
  procedureType: "Licitación Pública",
  participationScope: "international_open",
  publicationDate: "2026-09-15T00:00:00.000Z",
  submissionDeadline: "2026-10-01T00:00:00.000Z",
  estimatedValue: 47382915,
  currency: "MXN",
  location: "SECRET_LOCATION_LEON_GUANAJUATO",
  status: "open",
  qualifications: [{ id: "q", title: { zh: "SECRET_QUALIFICATION", es: "q", en: "q" }, description: { zh: "q", es: "q", en: "q" }, mandatory: true }],
  experienceRequirements: [{ id: "e", title: { zh: "SECRET_EXPERIENCE", es: "e", en: "e" }, description: { zh: "e", es: "e", en: "e" }, mandatory: true }],
  requiredDocuments: [{ id: "d", title: { zh: "SECRET_DOCUMENT", es: "d", en: "d" }, description: { zh: "d", es: "d", en: "d" }, mandatory: true }],
  keyDates: [{ id: "k", type: "clarification", date: "2026-09-20T00:00:00.000Z", notes: { zh: "SECRET_KEY_DATE", es: "k", en: "k" } }],
  risks: [{ id: "r", level: "high", title: { zh: "SECRET_RISK", es: "r", en: "r" }, description: { zh: "r", es: "r", en: "r" } }],
  relevance: { tier: "significant", label: { zh: "重要", es: "Importante", en: "Significant" }, reason: { zh: "原因", es: "Razón", en: "Reason" } },
  sourceName: "SECRET_SOURCE_NAME",
  sourceUrl: "https://SECRET_SOURCE_URL.example",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
} satisfies Tender;

const publicTender = toPublicTenderDetail(fullTender);
const serialized = JSON.stringify(publicTender);

const protectedMarkers = [
  "SECRET_INTERNAL_ID",
  "SECRET_SOURCE_DERIVED_SLUG",
  "SECRET_TENDER_CODE",
  "SECRET_ORIGINAL_TITLE",
  "SECRET_ONE_LINE_SUMMARY",
  "SECRET_QUALIFICATION",
  "SECRET_EXPERIENCE",
  "SECRET_DOCUMENT",
  "SECRET_KEY_DATE",
  "SECRET_RISK",
  "SECRET_SOURCE_NAME",
  "SECRET_SOURCE_URL",
  "采购单位",
  // Added 2026-09-19. A place name, an exact budget and an exact day are
  // each precise enough to find the original notice in one search — the
  // reason a reader could reach the source portal without subscribing.
  "SECRET_LOCATION_LEON_GUANAJUATO",
  // The translated title itself. It keeps the source proper noun in
  // parentheses by design (see lib/public-title.ts), which makes it the best
  // search key back to the source portal on the whole platform.
  "SECRET_PLACE_NAME",
  // The translated SUMMARY, added 2026-09-20. It is a faithful rendering of
  // the source `objeto`, which restates the project name and the municipality
  // — so shipping it under a redacted title handed back everything the title
  // had just removed, and it reached further than the title did: the meta
  // description built from it is the search-result snippet, read without the
  // page ever being opened.
  "SECRET_SUMMARY_PLACE",
  "47382915",
  // The exact publication DAY is deliberately NOT here any more (2026-09-20).
  // It was withheld with the rest on 2026-09-19 and put back on purpose: a
  // publication date is shared by hundreds of notices on the same portal, so
  // it identifies nothing on its own, while a dateline is what tells a reader
  // and a crawler the listing is current. The exact DEADLINE below stays —
  // that one a bidder acts on, and the page sells it.
  "2026-10-01",
];

for (const marker of protectedMarkers) {
  if (serialized.includes(marker)) throw new Error(`公开项目数据泄露了受保护字段：${marker}`);
}

if (publicTender.titleZh !== "墨西哥 变电站扩建工程（输配电）") {
  throw new Error("公开项目详情没有使用去标识化的公开标题");
}
if (publicTender.summaryZh !== "配电变电站的扩建工程，包含开关柜安装与配套土建施工。") {
  throw new Error("公开项目详情没有使用去标识化的公开摘要");
}

// The summary fails closed, and this is the assertion that keeps it that way.
// A future "fall back to summary.zh so the page isn't empty" is the single
// most likely way this protection gets undone, and it would look reasonable
// in review — so the placeholder is asserted by value rather than merely
// checked for not containing the marker.
const withoutPublicSummary = toPublicTenderDetail({ ...fullTender, summaryZhPublic: undefined });
if (withoutPublicSummary.summaryZh.includes("SECRET_SUMMARY_PLACE")) {
  throw new Error("没有公开摘要的项目回落到了原摘要——脱敏被绕过");
}
if (withoutPublicSummary.summaryZh !== GENERIC_PUBLIC_SUMMARY) {
  throw new Error(`没有公开摘要时应当显示占位文案，实际是：${withoutPublicSummary.summaryZh}`);
}

if (publicTender.publicSlug !== "p-7a3c91e4b6d82f05") {
  throw new Error("公开项目数据缺少不可反推的公开网址标识");
}

// Redacted, but still present and still honest: a band that contains the
// real figure and a month that contains the real day. A field that vanished
// entirely would read as a broken page; one that lies would be found out the
// moment the reader opens the official notice.
if (publicTender.estimatedValueBand !== "$1M – $5M USD") {
  throw new Error(`公开项目金额未按区间脱敏：${publicTender.estimatedValueBand}`);
}
// Asymmetric on purpose: the deadline loses its day, the publication date
// keeps it. Asserted by value in both directions, because the interesting
// regression is either one silently adopting the other's rule.
if (publicTender.submissionDeadline !== "2026-10") {
  throw new Error(`公开项目的交标日期未截断到年月：${publicTender.submissionDeadline}`);
}
if (publicTender.publicationDate !== "2026-09-15T00:00:00.000Z") {
  throw new Error(`公开项目的发布日期不应被截断：${publicTender.publicationDate}`);
}

const publicListItem = toTenderListItem(fullTender);
const serializedListItem = JSON.stringify(publicListItem);
for (const marker of ["SECRET_SOURCE_DERIVED_SLUG", "SECRET_ORIGINAL_TITLE", "SECRET_TENDER_CODE", "SECRET_SOURCE_NAME", "采购单位"]) {
  if (serializedListItem.includes(marker)) {
    throw new Error(`公开项目列表泄露了受保护字段：${marker}`);
  }
}
// The guest list row carries the band and the month; never the figure or
// the day. Checked on the serialized form as well as the fields, because
// what matters is what reaches the browser's React payload.
if (publicListItem.estimatedValue !== undefined) {
  throw new Error("访客项目列表泄露了精确金额");
}
if (publicListItem.estimatedValueBand !== "$1M – $5M USD") {
  throw new Error(`访客项目列表金额未按区间脱敏：${publicListItem.estimatedValueBand}`);
}
if (publicListItem.submissionDeadline !== "2026-10") {
  throw new Error("访客项目列表交标日期未截断到年月");
}
for (const marker of ["SECRET_LOCATION_LEON_GUANAJUATO", "47382915", "2026-10-01"]) {
  if (serializedListItem.includes(marker)) {
    throw new Error(`公开项目列表泄露了可反查的精确值：${marker}`);
  }
}

// A paying member loses none of it — the redaction is an entitlement
// boundary, not a data change.
if (publicListItem.titleZh !== "墨西哥 变电站扩建工程（输配电）") {
  throw new Error("访客项目列表没有使用去标识化的公开标题");
}

const memberListItem = toTenderListItem(fullTender, { memberView: true });
if (memberListItem.buyer !== "采购单位") {
  throw new Error("登录用户的项目列表缺少发布机构");
}
// The subscriber keeps the place name — the redaction is an entitlement
// boundary, not a downgrade of the data — but reads it in the condensed form
// rather than the full administrative sentence.
if (memberListItem.titleZh !== "SECRET_PLACE_NAME变电站扩建") {
  throw new Error("订阅用户的项目列表应显示短标题");
}
// Until the short title is generated, the member still sees the full
// translation. Falling open is right here and wrong for the public summary;
// both directions are asserted so neither can be "tidied up" into the other.
const memberWithoutShort = toTenderListItem({ ...fullTender, titleZhShort: undefined }, { memberView: true });
if (memberWithoutShort.titleZh !== "SECRET_PLACE_NAME变电站扩建工程") {
  throw new Error("没有短标题时订阅用户应回落到完整翻译标题");
}
if (memberListItem.estimatedValue !== 47382915 || memberListItem.estimatedValueBand !== undefined) {
  throw new Error("订阅用户的项目列表应显示精确金额");
}
if (memberListItem.submissionDeadline !== "2026-10-01T00:00:00.000Z") {
  throw new Error("订阅用户的项目列表应显示精确交标日期");
}
const untranslatedPublicItem = toTenderListItem({
  ...fullTender,
  title: { zh: "SECRET_ORIGINAL_TITLE", es: "SECRET_ORIGINAL_TITLE", en: "" },
});
if (untranslatedPublicItem.titleZh !== "政府采购项目") {
  throw new Error("未翻译的公开列表标题泄露了发布机构或原文名称");
}
if (publicTenderPath(fullTender) !== "/tenders/p-7a3c91e4b6d82f05") {
  throw new Error("公开项目链接没有使用不可反推的公开网址标识");
}

// --- The card projection (homepage, 收藏) ----------------------------------
// TenderCard is a client component, so whatever it receives is serialized
// into the HTML of whichever page renders it. It used to receive a whole
// Tender — on the homepage, the most crawled page on the site, and on
// /saved, which had no server-side gate and therefore returned the entire
// tender table to an unauthenticated request.
// The header bell. Its endpoint takes no credential — saved searches live in
// localStorage and the bell renders for logged-out visitors — so the row it
// returns has to be the guest projection by default. It used to send
// `title: tender.title`, the whole LocalizedText, so every one of up to fifty
// items carried the original Spanish title that nothing ever rendered.
const guestNotification = toNotificationTender(fullTender);
for (const marker of protectedMarkers.filter((m) => m !== "SECRET_INTERNAL_ID")) {
  if (JSON.stringify(guestNotification).includes(marker)) {
    throw new Error(`通知条目泄露了受保护字段：${marker}`);
  }
}
if (guestNotification.titleZh !== "墨西哥 变电站扩建工程（输配电）") {
  throw new Error("访客的通知条目没有使用去标识化的公开标题");
}
const memberNotification = toNotificationTender(fullTender, { memberView: true });
if (memberNotification.titleZh !== "SECRET_PLACE_NAME变电站扩建") {
  throw new Error("订阅用户的通知条目应显示短标题");
}
const untranslatedNotification = toNotificationTender({
  ...fullTender,
  title: { zh: "SECRET_ORIGINAL_TITLE", es: "SECRET_ORIGINAL_TITLE", en: "" },
});
if (untranslatedNotification.titleZh !== "政府采购项目") {
  throw new Error("还没翻译的项目不能把原文标题当成中文标题发给访客");
}

const guestCard = toTenderCardData(fullTender);
const serializedGuestCard = JSON.stringify(guestCard);
// The opaque row id is not a protected value — it is what SaveTenderButton
// posts, it is already in every list row, and nothing about it points back
// to the source. Every other marker must be absent.
const cardMarkers = protectedMarkers.filter((marker) => marker !== "SECRET_INTERNAL_ID");
for (const marker of cardMarkers) {
  if (serializedGuestCard.includes(marker)) {
    throw new Error(`访客项目卡片泄露了受保护字段：${marker}`);
  }
}
if (guestCard.titleOriginal !== undefined) {
  throw new Error("访客项目卡片泄露了原文标题");
}
if (guestCard.titleZh !== "墨西哥 变电站扩建工程（输配电）") {
  throw new Error("访客项目卡片没有使用去标识化的公开标题");
}
if (guestCard.summaryZh !== "配电变电站的扩建工程，包含开关柜安装与配套土建施工。") {
  throw new Error("访客项目卡片没有使用去标识化的公开摘要");
}
// The homepage, and ONLY the homepage, publishes the member title to guests
// (app/page.tsx). It opens that one field and nothing else: the original
// title, the buyer, the exact budget and the exact deadline all stay
// withheld, which is the whole reason it is a separate flag from memberView
// rather than a second caller passing memberView: true.
const shopfrontCard = toTenderCardData(fullTender, { memberTitle: true });
if (shopfrontCard.titleZh !== "SECRET_PLACE_NAME变电站扩建") {
  throw new Error("首页卡片应显示订阅用户的短标题");
}
if (shopfrontCard.titleOriginal !== undefined || shopfrontCard.buyer !== undefined || shopfrontCard.estimatedValue !== undefined) {
  throw new Error("首页卡片只开放标题，不得连带开放其他订阅字段");
}
if (shopfrontCard.submissionDeadline !== "2026-10") {
  throw new Error("首页卡片的交标日期仍应截断到年月");
}
// Same fail-closed rule as the detail page. The card is the worse of the two
// to get wrong: it renders on the homepage, the most crawled page on the site.
const guestCardWithoutSummary = toTenderCardData({ ...fullTender, summaryZhPublic: undefined });
if (guestCardWithoutSummary.summaryZh?.includes("SECRET_SUMMARY_PLACE")) {
  throw new Error("没有公开摘要的项目卡片回落到了原摘要——脱敏被绕过");
}
if (guestCardWithoutSummary.summaryZh !== GENERIC_PUBLIC_SUMMARY) {
  throw new Error(`没有公开摘要的项目卡片应显示占位文案，实际是：${guestCardWithoutSummary.summaryZh}`);
}
if (guestCard.estimatedValueBand !== "$1M – $5M USD" || guestCard.estimatedValue !== undefined) {
  throw new Error("访客项目卡片未按区间脱敏金额");
}
if (guestCard.submissionDeadline !== "2026-10") {
  throw new Error("访客项目卡片交标日期未截断到年月");
}

// The paywalled 投标重点预览 is opt-in, so the deadline ticker — which is not
// the admin-picked free-preview list — never carries it.
if (guestCard.qualification !== undefined || guestCard.risk !== undefined || guestCard.oneLineSummary !== undefined) {
  throw new Error("默认的项目卡片不应携带受保护的投标重点预览");
}
const previewCard = toTenderCardData(fullTender, { includeAnalysisPreview: true, showOneLineSummary: true });
if (previewCard.qualification === undefined || previewCard.risk === undefined) {
  throw new Error("首页免费预览卡片缺少投标重点预览");
}
// 一句话总结 and 摘要 said the same thing twice on the one card that shows
// both. The summary is dropped at the PROJECTION, not hidden in the view, so
// asserting on the object is asserting on the payload.
if (previewCard.summaryZh !== undefined) {
  throw new Error("带一句话总结的卡片不应再携带摘要");
}
// …but only when there is actually a one-line summary to replace it with.
const previewCardWithoutOneLine = toTenderCardData({ ...fullTender, oneLineSummary: undefined }, { includeAnalysisPreview: true, showOneLineSummary: true });
if (previewCardWithoutOneLine.summaryZh === undefined) {
  throw new Error("没有一句话总结时，卡片不能连摘要也没有");
}
// /saved renders TenderCard WITHOUT showOneLineSummary while still passing
// includeAnalysisPreview for a member. Tying the summary's removal to the
// preview flag instead of this one left those cards with no description line
// at all — the one-liner was not rendered and the summary was not sent.
const savedCard = toTenderCardData(fullTender, { memberView: true, includeAnalysisPreview: true });
if (savedCard.summaryZh === undefined) {
  throw new Error("不展示一句话总结的卡片必须保留摘要，否则卡片没有任何描述");
}
if (savedCard.oneLineSummary !== undefined) {
  throw new Error("不展示一句话总结的卡片不应携带一句话总结");
}
// Even then, the preview carries our analysis — never a source identifier.
for (const marker of ["SECRET_ORIGINAL_TITLE", "SECRET_SOURCE_URL", "SECRET_TENDER_CODE", "SECRET_SOURCE_DERIVED_SLUG", "47382915"]) {
  if (JSON.stringify(previewCard).includes(marker)) {
    throw new Error(`首页免费预览卡片泄露了可反查的字段：${marker}`);
  }
}

const memberCard = toTenderCardData(fullTender, { memberView: true, includeAnalysisPreview: true });
if (memberCard.titleOriginal !== "SECRET_ORIGINAL_TITLE" || memberCard.buyer !== "采购单位") {
  throw new Error("订阅用户的项目卡片缺少原文标题或发布机构");
}
if (memberCard.titleZh !== "SECRET_PLACE_NAME变电站扩建") {
  throw new Error("订阅用户的项目卡片应显示短标题");
}
// The member keeps the real summary; only the guest branch is redacted. Read
// off a card without the preview block, since a card carrying 一句话总结 no
// longer projects the summary at all.
const memberCardPlain = toTenderCardData(fullTender, { memberView: true });
if (!memberCardPlain.summaryZh?.includes("SECRET_SUMMARY_PLACE")) {
  throw new Error("订阅用户的项目卡片应显示完整摘要");
}
if (memberCard.estimatedValue !== 47382915 || memberCard.submissionDeadline !== "2026-10-01T00:00:00.000Z") {
  throw new Error("订阅用户的项目卡片应显示精确金额与日期");
}
// The source URL and the ingestion slug are withheld from EVERY audience,
// members included: nothing on a card renders them, and a field nothing
// renders is a field that only travels.
for (const marker of ["SECRET_SOURCE_URL", "SECRET_SOURCE_DERIVED_SLUG", "SECRET_TENDER_CODE"]) {
  if (JSON.stringify(memberCard).includes(marker)) {
    throw new Error(`项目卡片不应携带 ${marker}`);
  }
}

console.log("OK  public tender detail, list, card and URL expose no source-derived identifier");
