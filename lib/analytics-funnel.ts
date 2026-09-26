/**
 * The acquisition funnel on /admin/analytics: where outside visitors came
 * from, where they landed, and how far each got towards opening an account.
 *
 * A "visitor" is one analytics id — a random value kept in the browser's
 * localStorage (lib/analytics-client.ts) — so the same person on a phone and
 * a laptop counts twice, and a returning visitor counts once. Pure, so
 * scripts/test-analytics-source.ts can check it on fixtures;
 * lib/db/analytics-funnel.ts reads the rows.
 */

import { classifyTrafficSource, landingPageGroup, TRAFFIC_SOURCE_LABELS, type TrafficSourceKey } from "./analytics-source";

export type FunnelPageView = {
  session_id: string;
  user_id: string | null;
  path: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
};
export type FunnelSignup = { userId: string; createdAt: string };

export type FunnelStageKey = "visitors" | "engaged" | "detail" | "pricing" | "register" | "signup";
export type FunnelSourceRow = {
  key: TrafficSourceKey;
  label: string;
  visitors: number;
  engaged: number;
  detail: number;
  register: number;
  signups: number;
  /** The most common referring hosts or tags behind this source. */
  examples: string[];
};
export type AcquisitionFunnel = {
  visitors: number;
  stages: { key: FunnelStageKey; label: string; count: number }[];
  sources: FunnelSourceRow[];
  landings: { page: string; visitors: number; singlePage: number }[];
  signups: number;
  /** Accounts opened in the period whose browser never sent a page view we could link. */
  unlinkedSignups: number;
  truncated: boolean;
};

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  visitors: "外部访客",
  engaged: "浏览 2 页以上",
  detail: "打开项目详情",
  pricing: "查看价格页",
  register: "进入注册页",
  signup: "完成注册",
};

type VisitorSummary = {
  source: { key: TrafficSourceKey; detail: string | null };
  landing: string;
  pages: number;
  detail: boolean;
  pricing: boolean;
  register: boolean;
  signedUp: boolean;
};

function summarizeVisitor(rows: FunnelPageView[], signupIds: Set<string>): VisitorSummary {
  // The first page load in the period that carries the entry mark says where
  // the visitor came from; rows from before source tracking carry none.
  const entry = rows.find((row) => row.properties?.entry === true);
  const paths = rows.map((row) => (row.path ?? "").split("?")[0]);
  return {
    source: classifyTrafficSource(entry?.properties),
    landing: landingPageGroup(rows[0]?.path),
    pages: rows.length,
    detail: paths.some((path) => /^\/tenders\/.+/.test(path)),
    pricing: paths.some((path) => path.startsWith("/pricing")),
    register: paths.some((path) => path.startsWith("/register")),
    signedUp: rows.some((row) => row.user_id !== null && signupIds.has(row.user_id)),
  };
}

function topExamples(counts: Map<string, number>, limit = 3): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
}

/**
 * Rows must be in created_at order; lib/db/analytics-funnel.ts reads them that
 * way. `ownUserIds` are our own accounts: their sign-ups are not counted, and
 * a browser that was ever signed in to one is ours too, so all of its page
 * views leave the funnel with it.
 */
export function buildAcquisitionFunnel(
  allRows: FunnelPageView[],
  allSignups: FunnelSignup[],
  ownUserIds: ReadonlySet<string> = new Set(),
): Omit<AcquisitionFunnel, "truncated"> {
  const ownBrowsers = new Set(allRows.filter((row) => row.user_id !== null && ownUserIds.has(row.user_id)).map((row) => row.session_id));
  const rows = allRows.filter((row) => !ownBrowsers.has(row.session_id));
  const signups = allSignups.filter((signup) => !ownUserIds.has(signup.userId));
  const signupIds = new Set(signups.map((signup) => signup.userId));
  const byVisitor = new Map<string, FunnelPageView[]>();
  for (const row of rows) {
    const list = byVisitor.get(row.session_id);
    if (list) list.push(row);
    else byVisitor.set(row.session_id, [row]);
  }
  const visitors = [...byVisitor.values()].map((list) => summarizeVisitor(list, signupIds));

  const sources = new Map<TrafficSourceKey, FunnelSourceRow & { exampleCounts: Map<string, number> }>();
  const landings = new Map<string, { page: string; visitors: number; singlePage: number }>();
  for (const visitor of visitors) {
    const source = sources.get(visitor.source.key) ?? {
      key: visitor.source.key,
      label: TRAFFIC_SOURCE_LABELS[visitor.source.key],
      visitors: 0, engaged: 0, detail: 0, register: 0, signups: 0, examples: [],
      exampleCounts: new Map<string, number>(),
    };
    source.visitors += 1;
    if (visitor.pages > 1) source.engaged += 1;
    if (visitor.detail) source.detail += 1;
    if (visitor.register) source.register += 1;
    if (visitor.signedUp) source.signups += 1;
    if (visitor.source.detail) source.exampleCounts.set(visitor.source.detail, (source.exampleCounts.get(visitor.source.detail) ?? 0) + 1);
    sources.set(visitor.source.key, source);

    const landing = landings.get(visitor.landing) ?? { page: visitor.landing, visitors: 0, singlePage: 0 };
    landing.visitors += 1;
    if (visitor.pages === 1) landing.singlePage += 1;
    landings.set(visitor.landing, landing);
  }

  const linkedSignups = new Set(rows.filter((row) => row.user_id !== null && signupIds.has(row.user_id)).map((row) => row.user_id));
  const count = (test: (visitor: VisitorSummary) => boolean) => visitors.filter(test).length;
  const stageCounts: Record<FunnelStageKey, number> = {
    visitors: visitors.length,
    engaged: count((visitor) => visitor.pages > 1),
    detail: count((visitor) => visitor.detail),
    pricing: count((visitor) => visitor.pricing),
    register: count((visitor) => visitor.register),
    // Every account opened in the period, including one whose browser blocked
    // analytics: the stage is about accounts, not about page views.
    signup: signups.length,
  };

  return {
    visitors: visitors.length,
    stages: (Object.keys(STAGE_LABELS) as FunnelStageKey[]).map((key) => ({ key, label: STAGE_LABELS[key], count: stageCounts[key] })),
    sources: [...sources.values()]
      .map(({ exampleCounts, ...row }) => ({ ...row, examples: topExamples(exampleCounts) }))
      .sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label)),
    landings: [...landings.values()].sort((a, b) => b.visitors - a.visitors || a.page.localeCompare(b.page)).slice(0, 10),
    signups: signups.length,
    unlinkedSignups: signups.length - linkedSignups.size,
  };
}
