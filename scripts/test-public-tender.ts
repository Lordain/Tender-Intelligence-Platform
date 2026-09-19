import { toPublicTenderDetail } from "../lib/public-tender";
import { toTenderListItem } from "../lib/tender-list-page";
import { publicTenderPath } from "../lib/public-tender-url";
import type { Tender } from "../types/tender";

const fullTender = {
  id: "SECRET_INTERNAL_ID",
  slug: "SECRET_SOURCE_DERIVED_SLUG",
  publicSlug: "p-7a3c91e4b6d82f05",
  tenderNumber: "SECRET_TENDER_CODE",
  title: { zh: "中文标题", es: "SECRET_ORIGINAL_TITLE", en: "English title" },
  summary: { zh: "中文摘要", es: "Resumen", en: "Summary" },
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
  "47382915",
  "2026-09-15",
  "2026-10-01",
];

for (const marker of protectedMarkers) {
  if (serialized.includes(marker)) throw new Error(`公开项目数据泄露了受保护字段：${marker}`);
}

if (publicTender.titleZh !== "中文标题" || publicTender.summaryZh !== "中文摘要") {
  throw new Error("公开项目数据缺少中文标题或中文摘要");
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
if (publicTender.publicationDate !== "2026-09" || publicTender.submissionDeadline !== "2026-10") {
  throw new Error("公开项目日期未截断到年月");
}

const publicListItem = toTenderListItem(fullTender);
const serializedListItem = JSON.stringify(publicListItem);
for (const marker of ["SECRET_SOURCE_DERIVED_SLUG", "SECRET_ORIGINAL_TITLE", "SECRET_TENDER_CODE", "采购单位"]) {
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
const memberListItem = toTenderListItem(fullTender, { memberView: true });
if (memberListItem.buyer !== "采购单位") {
  throw new Error("登录用户的项目列表缺少发布机构");
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

console.log("OK  public tender detail, list and URL expose no source-derived identifier");
