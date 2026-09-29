/**
 * Saved-search reminders follow the list page's filters and viewer rules
 * (2026-09-26 review).
 *
 * Before: the reminder route ignored the saved link's `country`, `tier` and
 * `industryMode`, treated a missing `status` as every stage, and let a Basic
 * subscriber's keywords search the Spanish title, buyer and procurement
 * number of every country — a way to ask about fields of countries they had
 * not bought, one yes/no at a time.
 *
 * The strongest check here is the equivalence one: for every viewer and every
 * saved link, the reminder rows are exactly the rows /tenders lists for that
 * viewer and that link, with the same projected titles.
 *
 * Offline and pure.
 */
import { buildTenderListPage, tenderListViewerRules, toNotificationTender } from "../lib/tender-list-page";
import { isSavedSearchInput, matchSavedSearchAlerts, type SavedSearchInput } from "../lib/saved-search-alerts";
import type { ViewerEntitlement } from "../lib/access-control";
import type { Tender, TenderRelevanceTier, TenderStatus } from "../types/tender";

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed += 1; console.log(`OK   ${label}`); }
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

function tender(slug: string, country: string, o: { es?: string; zh?: string; buyer?: string; status?: TenderStatus; tier?: TenderRelevanceTier; industries?: string[]; createdAt?: string } = {}): Tender {
  return {
    id: slug,
    slug,
    publicSlug: slug,
    tenderNumber: `NUM-${slug}`,
    title: { zh: o.zh ?? `${country}变电站扩建工程`, es: o.es ?? `Ampliación de subestación ${slug}` },
    // The two generated titles differ, so a wrong projection shows up.
    titleZhShort: `会员标题 ${slug}`,
    titleZhPublic: `公开标题 ${slug}`,
    summary: { zh: "", es: "" },
    buyer: o.buyer ?? `Comisión ${slug}`,
    industries: o.industries ?? ["power"],
    scopeType: "works",
    status: o.status ?? "open",
    country,
    currency: "USD",
    estimatedValue: 5_000_000,
    publicationDate: "2026-09-20",
    submissionDeadline: "2026-12-01T17:00:00.000Z",
    relevance: { tier: o.tier ?? "significant", label: "", reason: "" },
    createdAt: o.createdAt ?? "2026-09-25T10:00:00.000Z",
    keyDates: [],
    requirements: [],
    risks: [],
  } as unknown as Tender;
}

const rows: Tender[] = [
  tender("mx-1", "Mexico", { es: "Licitación Pemex refinería Tula", buyer: "Pemex Transformación", industries: ["oil_gas"] }),
  tender("mx-2", "Mexico", { status: "awarded" }),
  tender("mx-3", "Mexico", { tier: "flagship", industries: ["power", "ict_telecom"] }),
  tender("br-1", "Brazil", { es: "Pregão eletrônico Petrobras refinaria", buyer: "Petrobras S.A." }),
  tender("br-2", "Brazil", { status: "planned", zh: "巴西港口疏浚工程" , industries: ["transport"] }),
  tender("co-1", "Colombia", { status: "submission_closed" }),
  tender("pe-1", "Peru", { tier: "flagship" }),
  tender("cl-1", "Chile", { es: "Codelco Chuquicamata mantención", buyer: "Codelco" }),
  // Not an AVAILABLE_COUNTRIES country (Guyana is staged): never on /tenders, so never in a reminder.
  tender("gy-1", "Guyana"),
  // Argentina opened 2026-09-29: on /tenders, so in reminders.
  tender("ar-1", "Argentina"),
  tender("mx-old", "Mexico", { createdAt: "2026-09-01T00:00:00.000Z" }),
];

function entitlement(role: ViewerEntitlement["role"], plan: ViewerEntitlement["plan"] = null, selectedCountry: string | null = null): ViewerEntitlement {
  return { role, plan, selectedCountry, trialEndsAt: null, subscriptionOwnerUserId: null, isEnterpriseOwner: false, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false, billingInterval: null, paymentPastDue: false, hasBillingLink: false };
}
const viewers: Record<string, ViewerEntitlement> = {
  游客: entitlement("guest"),
  免费版: entitlement("free"),
  试用: entitlement("trial"),
  基础版墨西哥: entitlement("subscriber", "basic", "Mexico"),
  基础版未选国家: entitlement("subscriber", "basic", null),
  专业版: entitlement("subscriber", "professional"),
  企业版: entitlement("subscriber", "enterprise"),
};

let n = 0;
function search(href: string, lastCheckedAt = "2026-09-10T00:00:00.000Z"): SavedSearchInput {
  n += 1;
  return { id: `s${n}`, name: `搜索${n}`, href, alertEnabled: true, lastCheckedAt };
}
function alertIds(viewer: ViewerEntitlement, href: string, lastCheckedAt?: string) {
  return matchSavedSearchAlerts(rows, [search(href, lastCheckedAt)], tenderListViewerRules(viewer)).map((alert) => alert.tender.id).sort();
}

// ── Country ──────────────────────────────────────────────────────────────
check("country=Peru reminds about Peru only (before: every country)", JSON.stringify(alertIds(viewers.专业版!, "/tenders?country=Peru")) === JSON.stringify(["pe-1"]));
check("country=Mexico,Chile is honoured", alertIds(viewers.专业版!, "/tenders?country=Mexico,Chile&status=none").every((id) => id.startsWith("mx") || id.startsWith("cl")));
check("no country param = the open countries only, never Guyana", !alertIds(viewers.专业版!, "/tenders?status=none").includes("gy-1"));
check("no country param includes Argentina since it opened", alertIds(viewers.专业版!, "/tenders?status=none").includes("ar-1"));
check("Basic (Mexico) saving country=Brazil still gets Brazil reminders, as the list shows them", JSON.stringify(alertIds(viewers.基础版墨西哥!, "/tenders?country=Brazil")) === JSON.stringify(["br-1", "br-2"]));

// ── Stage, scale, industries ─────────────────────────────────────────────
check("no status param = the list's live default (open, planned, clarification)", !alertIds(viewers.专业版!, "/tenders?country=Mexico").includes("mx-2") && !alertIds(viewers.专业版!, "/tenders?country=Colombia").includes("co-1"));
check("status=none = every stage (before: nothing at all)", alertIds(viewers.专业版!, "/tenders?country=Colombia&status=none").includes("co-1"));
check("status=awarded", JSON.stringify(alertIds(viewers.专业版!, "/tenders?status=awarded")) === JSON.stringify(["mx-2"]));
check("tier=flagship is honoured (before: ignored)", JSON.stringify(alertIds(viewers.专业版!, "/tenders?tier=flagship")) === JSON.stringify(["mx-3", "pe-1"]));
check("industryMode=all is honoured (before: any)", JSON.stringify(alertIds(viewers.专业版!, "/tenders?industry=power,ict_telecom&industryMode=all")) === JSON.stringify(["mx-3"]));

// ── Keyword scope per viewer ─────────────────────────────────────────────
for (const name of ["游客", "免费版", "基础版墨西哥", "基础版未选国家"]) {
  const viewer = viewers[name]!;
  check(`${name}: a Spanish title word matches nothing (other country)`, alertIds(viewer, "/tenders?q=petrobras").length === 0);
  check(`${name}: a Spanish title word matches nothing (own/any country)`, alertIds(viewer, "/tenders?q=pemex").length === 0);
  check(`${name}: buyer and procurement number are not searched`, alertIds(viewer, "/tenders?q=codelco").length === 0 && alertIds(viewer, "/tenders?q=NUM-mx-1").length === 0);
  check(`${name}: Chinese public copy is searched`, JSON.stringify(alertIds(viewer, "/tenders?q=港口疏浚&status=none")) === JSON.stringify(["br-2"]));
}
for (const name of ["试用", "专业版", "企业版"]) {
  const viewer = viewers[name]!;
  check(`${name}: full search across countries (title, buyer, number)`, JSON.stringify(alertIds(viewer, "/tenders?q=petrobras")) === JSON.stringify(["br-1"]) && JSON.stringify(alertIds(viewer, "/tenders?q=codelco")) === JSON.stringify(["cl-1"]) && JSON.stringify(alertIds(viewer, "/tenders?q=NUM-mx-1")) === JSON.stringify(["mx-1"]));
}

// ── Projection per row ───────────────────────────────────────────────────
function projections(viewer: ViewerEntitlement) {
  return new Map(matchSavedSearchAlerts(rows, [search("/tenders?status=none")], tenderListViewerRules(viewer)).map((alert) => [alert.tender.id, alert.tender.titleZh]));
}
const byId = new Map(rows.map((row) => [row.id, row]));
const member = (id: string) => toNotificationTender(byId.get(id)!, { memberView: true }).titleZh;
const publicTitle = (id: string) => toNotificationTender(byId.get(id)!, { memberView: false }).titleZh;
check("member and public titles differ in this fixture (so the checks below mean something)", member("br-1") !== publicTitle("br-1"));
const basic = projections(viewers.基础版墨西哥!);
check("Basic (Mexico): Mexico rows get the member title", basic.get("mx-1") === member("mx-1"));
check("Basic (Mexico): other countries get the public title", basic.get("br-1") === publicTitle("br-1") && basic.get("cl-1") === publicTitle("cl-1"));
check("Basic without a chosen country: public titles everywhere", [...projections(viewers.基础版未选国家!)].every(([id, title]) => title === publicTitle(id)));
check("guest and free: public titles everywhere", [...projections(viewers.游客!), ...projections(viewers.免费版!)].every(([id, title]) => title === publicTitle(id)));
check("professional: member titles everywhere", [...projections(viewers.专业版!)].every(([id, title]) => title === member(id)));
const guestAlert = matchSavedSearchAlerts(rows, [search("/tenders?status=none")], tenderListViewerRules(viewers.游客!))[0]!;
check("a reminder row carries only id, slug, Chinese title and dates", JSON.stringify(Object.keys(guestAlert.tender).sort()) === JSON.stringify(["createdAt", "id", "publicSlug", "publicationDate", "titleZh"]));
check("no original-language title, buyer or number anywhere in a guest's reminders", !JSON.stringify(matchSavedSearchAlerts(rows, [search("/tenders?status=none")], tenderListViewerRules(viewers.游客!))).match(/Petrobras|Pemex|Codelco|NUM-|Comisión|subestación/i));

// ── Equivalence with /tenders ────────────────────────────────────────────
const hrefs = [
  "/tenders", "/tenders?country=Peru", "/tenders?country=Mexico,Brazil&status=none", "/tenders?status=awarded", "/tenders?tier=flagship",
  "/tenders?q=petrobras", "/tenders?q=变电站", "/tenders?q=港口&status=none", "/tenders?industry=power,ict_telecom&industryMode=all",
  "/tenders?scope=works&country=Chile", "/tenders?status=none&tier=none", "/tenders?q=codelco&country=Chile",
];
let mismatches = 0;
for (const [name, viewer] of Object.entries(viewers)) {
  const rules = tenderListViewerRules(viewer);
  for (const href of hrefs) {
    const params = Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? ""));
    const page = buildTenderListPage(rows, params, { pageSize: 1000, now: new Date("2026-09-26T12:00:00Z"), ...rules });
    const listed = new Map(page.tenders.map((item) => [item.id, item.titleZh]));
    // lastCheckedAt before every createdAt, so "new since" drops nothing.
    const alerts = matchSavedSearchAlerts(rows, [search(href, "2000-01-01T00:00:00.000Z")], rules);
    const same = alerts.length === listed.size && alerts.every((alert) => listed.get(alert.tender.id) === alert.tender.titleZh);
    if (!same) { mismatches += 1; console.error(`  ${name} ${href}: list ${[...listed.keys()]} vs alerts ${alerts.map((a) => a.tender.id)}`); }
  }
}
check(`reminders = the /tenders rows and titles for every viewer × link (${Object.keys(viewers).length} × ${hrefs.length})`, mismatches === 0);

// ── New-since, caps, input validation ────────────────────────────────────
check("only rows created after lastCheckedAt", !alertIds(viewers.专业版!, "/tenders?country=Mexico", "2026-09-10T00:00:00.000Z").includes("mx-old") && alertIds(viewers.专业版!, "/tenders?country=Mexico", "2026-08-01T00:00:00.000Z").includes("mx-old"));
check("a search with reminders off or a malformed entry is ignored", !isSavedSearchInput({ ...search("/tenders"), alertEnabled: false }) && !isSavedSearchInput({ id: 1 }) && !isSavedSearchInput(null));
const many = Array.from({ length: 30 }, () => search("/tenders?status=none"));
const capped = matchSavedSearchAlerts(rows, many, tenderListViewerRules(viewers.专业版!));
check("at most 20 searches and 50 reminders", capped.length === 50 && new Set(capped.map((alert) => alert.searchId)).size <= 20);
check("newest first", capped.every((alert, i) => i === 0 || capped[i - 1]!.tender.createdAt >= alert.tender.createdAt));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
