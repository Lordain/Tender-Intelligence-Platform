/**
 * What each registered user did on the site, one row per account, for
 * /admin/analytics 「注册用户活跃度」 and the daily 「注册用户今天有访问」
 * email (user, 2026-10-09: 目前有两名注册用户，能看到他们看了多少页面吗).
 *
 * Pure, so scripts/test-user-activity.ts can check it on fixtures;
 * lib/db/user-activity.ts reads the rows. Everything here is admin-only:
 * the rows carry an email address, which is why they are never part of a
 * public page or an aggregate the browser can read.
 */

export type ActivityEvent = {
  event_type: string;
  user_id: string;
  tender_id: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
};
export type ActivityAccount = {
  id: string;
  email: string | null;
  createdAt: string;
  /** From email_notification_preferences.enabled; missing row = never turned on. */
  emailNotifications: boolean;
};
export type UserActivityRow = {
  userId: string;
  email: string | null;
  signedUpAt: string;
  lastSeenAt: string | null;
  pageViews: number;
  tendersOpened: number;
  /** Tenders saved right now: the last save/unsave of each decides. */
  tendersSaved: number;
  /** One entry per filter dimension used, e.g. 「国家：Chile、Peru」. */
  filters: string[];
  emailNotifications: boolean;
  /** Page views in the last 24 hours, for the daily email. */
  pageViewsLast24h: number;
};

const DIMENSION_LABELS: Record<string, string> = {
  country: "国家",
  industry: "行业",
  scope: "采购类型",
  status: "状态",
  tier: "项目规模",
  sort: "排序",
  view: "视图",
  search: "搜索",
};

/** The cell for the filter column; the first few values per dimension, in order of use. */
export function describeFilters(events: ActivityEvent[]): string[] {
  const byDimension = new Map<string, string[]>();
  for (const event of events) {
    if (event.event_type !== "filter_apply") continue;
    const dimension = event.properties?.dimension;
    const values = event.properties?.values;
    if (typeof dimension !== "string" || !Array.isArray(values)) continue;
    const seen = byDimension.get(dimension) ?? [];
    for (const value of values) if (typeof value === "string" && !seen.includes(value)) seen.push(value);
    byDimension.set(dimension, seen);
  }
  return [...byDimension].map(([dimension, values]) => {
    const shown = values.slice(0, 4).join("、");
    return `${DIMENSION_LABELS[dimension] ?? dimension}：${shown}${values.length > 4 ? ` 等${values.length}项` : ""}`;
  });
}

export function buildUserActivity(accounts: ActivityAccount[], events: ActivityEvent[], now: Date): UserActivityRow[] {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const byUser = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const list = byUser.get(event.user_id);
    if (list) list.push(event);
    else byUser.set(event.user_id, [event]);
  }
  return accounts
    .map((account) => {
      // Oldest first, so the last save/unsave of a tender is the one that counts.
      const own = (byUser.get(account.id) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      const opened = new Set<string>();
      const saved = new Set<string>();
      let pageViews = 0;
      let pageViewsLast24h = 0;
      for (const event of own) {
        if (event.event_type === "page_view") {
          pageViews += 1;
          if (new Date(event.created_at).getTime() >= dayAgo) pageViewsLast24h += 1;
        } else if (event.event_type === "tender_open" && event.tender_id) opened.add(event.tender_id);
        else if (event.event_type === "tender_save" && event.tender_id) saved.add(event.tender_id);
        else if (event.event_type === "tender_unsave" && event.tender_id) saved.delete(event.tender_id);
      }
      return {
        userId: account.id,
        email: account.email,
        signedUpAt: account.createdAt,
        lastSeenAt: own.length > 0 ? own[own.length - 1].created_at : null,
        pageViews,
        tendersOpened: opened.size,
        tendersSaved: saved.size,
        filters: describeFilters(own),
        emailNotifications: account.emailNotifications,
        pageViewsLast24h,
      };
    })
    // Most recently seen first; accounts that never came back last, newest sign-up first.
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || b.signedUpAt.localeCompare(a.signedUpAt));
}
