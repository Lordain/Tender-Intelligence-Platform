/** Offline regression checks for the five-day 招标概览 deadline window. */
import { buildTenderListPage } from "../lib/tender-list-page";
import type { Tender, TenderStatus } from "../types/tender";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function tender(slug: string, deadline: string | undefined, status: TenderStatus = "open", country = "Mexico"): Tender {
  return {
    id: slug,
    slug,
    publicSlug: slug,
    tenderNumber: slug,
    title: { zh: slug, es: slug, en: slug },
    summary: { zh: "", es: "", en: "" },
    buyer: "buyer",
    country,
    governmentLevel: "federal",
    industries: ["construction"],
    scopeType: "works",
    status,
    procedureType: "Licitación pública",
    publicationDate: "2026-09-14T00:00:00.000Z",
    submissionDeadline: deadline,
    keyDates: [],
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    risks: [],
    sourceUrl: "https://example.com",
    sourceName: "test",
    relevance: { tier: "standard", label: { zh: "", es: "", en: "" }, reason: { zh: "", es: "", en: "" } },
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

const now = new Date("2026-09-15T12:00:00.000Z");
const rows = [
  tender("in-one-hour", "2026-09-15T13:00:00.000Z"),
  tender("at-five-days", "2026-09-20T12:00:00.000Z"),
  tender("past", "2026-09-15T11:59:59.000Z"),
  tender("too-late", "2026-09-20T12:00:01.000Z"),
  tender("awarded", "2026-09-16T12:00:00.000Z", "awarded"),
  tender("cancelled", "2026-09-16T12:00:00.000Z", "cancelled"),
  tender("broken", "not-a-date"),
  tender("missing", undefined),
];

const page = buildTenderListPage(rows, { status: "planned,open,clarification,awarded,cancelled" }, { now });
check("counts only live tenders due within the next five rolling days", page.upcomingCount === 2);

const deadlineView = buildTenderListPage(
  rows,
  { status: "planned,open,clarification,awarded,cancelled", view: "deadline" },
  { now },
);
check("deadline view shows exactly the tenders counted", deadlineView.totalResults === 2);
check(
  "deadline view keeps both window boundaries",
  deadlineView.tenders.map((item) => item.id).join(",") === "in-one-hour,at-five-days",
);

const sameDay = [
  tender("pe-1", "2026-09-18T09:00:00.000Z", "open", "Peru"),
  tender("pe-2", "2026-09-18T12:00:00.000Z", "open", "Peru"),
  tender("pe-3", "2026-09-18T17:00:00.000Z", "open", "Peru"),
  tender("mx-1", "2026-09-18T10:00:00.000Z", "open", "Mexico"),
  tender("mx-2", "2026-09-18T15:00:00.000Z", "open", "Mexico"),
  tender("co-1", "2026-09-18T11:00:00.000Z", "open", "Colombia"),
];
const mixedPage = buildTenderListPage(sameDay, {}, { now, pageSize: 10 });
check(
  "same-day tender-list results round-robin countries before pagination",
  mixedPage.tenders.map((item) => item.id).join(",") === "pe-1,mx-1,co-1,pe-2,mx-2,pe-3",
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
