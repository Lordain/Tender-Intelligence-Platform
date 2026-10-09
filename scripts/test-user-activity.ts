/**
 * Checks the per-user activity rows (lib/user-activity.ts) behind
 * /admin/analytics 「注册用户活跃度」 and the daily visit email. Offline.
 */
import { buildUserActivity, describeFilters, type ActivityEvent } from "../lib/user-activity";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const now = new Date("2026-10-10T02:00:00Z");
const ev = (user: string, type: string, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  event_type: type, user_id: user, tender_id: null, properties: null, created_at: at, ...extra,
});
const accounts = [
  { id: "a", email: "a@x.com", createdAt: "2026-10-01T00:00:00Z", emailNotifications: true },
  { id: "b", email: "b@x.com", createdAt: "2026-10-05T00:00:00Z", emailNotifications: false },
  { id: "c", email: null, createdAt: "2026-10-08T00:00:00Z", emailNotifications: false },
];
const events: ActivityEvent[] = [
  ev("a", "page_view", "2026-10-02T01:00:00Z"),
  ev("a", "page_view", "2026-10-10T01:00:00Z"),
  ev("a", "page_view", "2026-10-09T23:00:00Z"),
  ev("a", "tender_open", "2026-10-02T01:01:00Z", { tender_id: "t1" }),
  ev("a", "tender_open", "2026-10-02T01:02:00Z", { tender_id: "t1" }),
  ev("a", "tender_open", "2026-10-02T01:03:00Z", { tender_id: "t2" }),
  ev("a", "tender_save", "2026-10-02T01:04:00Z", { tender_id: "t1" }),
  ev("a", "tender_save", "2026-10-02T01:05:00Z", { tender_id: "t2" }),
  ev("a", "tender_unsave", "2026-10-02T01:06:00Z", { tender_id: "t2" }),
  ev("a", "filter_apply", "2026-10-02T01:07:00Z", { properties: { dimension: "country", values: ["Chile", "Peru"] } }),
  ev("a", "filter_apply", "2026-10-02T01:08:00Z", { properties: { dimension: "country", values: ["Chile"] } }),
  ev("a", "filter_apply", "2026-10-02T01:09:00Z", { properties: { dimension: "industry", values: ["能源"] } }),
  ev("b", "page_view", "2026-10-06T00:00:00Z"),
];
const rows = buildUserActivity(accounts, events, now);

check("order: latest visit first, never-visited last", rows.map((row) => row.userId), ["a", "b", "c"]);
const a = rows[0];
check("page views", a.pageViews, 3);
check("page views in the last 24h", a.pageViewsLast24h, 2);
check("tenders opened counts distinct tenders", a.tendersOpened, 2);
check("saved: last save/unsave decides", a.tendersSaved, 1);
check("last seen is the newest event", a.lastSeenAt, "2026-10-10T01:00:00Z");
check("filters grouped per dimension", a.filters, ["国家：Chile、Peru", "行业：能源"]);
check("notifications flag carried", [a.emailNotifications, rows[1].emailNotifications], [true, false]);
check("user with no events", [rows[2].pageViews, rows[2].lastSeenAt, rows[2].filters], [0, null, []]);
check("other users' events stay apart", rows[1].pageViews, 1);
check("many values are cut", describeFilters([ev("a", "filter_apply", "x", { properties: { dimension: "industry", values: ["1", "2", "3", "4", "5", "6"] } })]), ["行业：1、2、3、4 等6项"]);
check("malformed filter ignored", describeFilters([ev("a", "filter_apply", "x", { properties: { dimension: 5, values: "no" } })]), []);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("user activity: all checks passed");
