import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { BILLING_MONTHS, PLAN_PRICES_USD, type PaidPlan } from "@/lib/billing-catalog";
import type { BillingInterval } from "@/lib/access-control";

export type AnalyticsPeriod = { pageViews: number; visitors: number };
export type AnalyticsDashboardData = {
  generatedAt: string;
  selectedDays: number;
  periods: { today: AnalyticsPeriod; week: AnalyticsPeriod; month: AnalyticsPeriod };
  trend: { day: string; views: number; visitors: number }[];
  filters: { dimension: string; value: string; count: number }[];
  projectClicks: { tenderId: string; title: string; slug: string; count: number; visitors: number }[];
  favorites: { tenderId: string; title: string; slug: string; count: number }[];
  subscriptions: {
    activeUsers: number;
    trialingUsers: number;
    registeredUsers: number;
    byPlan: { plan: string; count: number }[];
  };
  payments: {
    activeStripeSubscriptions: number;
    activeManualSubscriptions: number;
    pastDueSubscriptions: number;
    monthlyListValueUsd: number;
    manualCollectedUsd: number;
    manualPendingUsd: number;
    manualPendingRequests: number;
  };
};

type DailyEventRow = { day: string; event_count: number | string; visitor_count: number | string };
type DailyFilterRow = { dimension: string; value: string; use_count: number | string };
type DailyTenderRow = {
  tender_id: string;
  tender_title: string;
  slug: string;
  open_count: number | string;
  visitor_count: number | string;
};
type FavoriteRow = { tender_id: string; tender_title: string; slug: string; favorite_count: number | string };
type SubscriptionRow = {
  user_id: string;
  plan: string;
  status: string;
  billing_interval: string | null;
  payment_source: string | null;
  current_period_end: string | null;
};
type ManualPaymentRow = { status: string; amount_minor: number | string; currency: string };
type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const BILLING_PAGE_SIZE = 1000;

async function fetchSubscriptionRows(supabase: AdminClient): Promise<SubscriptionRow[]> {
  const rows: SubscriptionRow[] = [];
  for (let from = 0; ; from += BILLING_PAGE_SIZE) {
    const { data, error } = await supabase.from("subscriptions")
      .select("user_id,plan,status,billing_interval,payment_source,current_period_end")
      .range(from, from + BILLING_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as SubscriptionRow[];
    rows.push(...page);
    if (page.length < BILLING_PAGE_SIZE) return rows;
  }
}

async function fetchManualPaymentRows(supabase: AdminClient): Promise<ManualPaymentRow[]> {
  const rows: ManualPaymentRow[] = [];
  for (let from = 0; ; from += BILLING_PAGE_SIZE) {
    const { data, error } = await supabase.from("manual_payment_requests")
      .select("status,amount_minor,currency")
      .range(from, from + BILLING_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ManualPaymentRow[];
    rows.push(...page);
    if (page.length < BILLING_PAGE_SIZE) return rows;
  }
}

function number(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function periodStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchPeriodSummary(days: number): Promise<AnalyticsPeriod> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { pageViews: 0, visitors: 0 };
  const { data, error } = await supabase.rpc("analytics_period_summary", { period_start: periodStart(days) });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { pageViews: number(row?.page_views), visitors: number(row?.visitors) };
}

export async function fetchAnalyticsDashboard(days: number): Promise<AnalyticsDashboardData | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const selectedDays = [7, 30, 90].includes(days) ? days : 30;
  const sinceDay = dateKey(new Date(Date.now() - (selectedDays - 1) * 24 * 60 * 60 * 1000));

  const [today, week, month, dailyResult, filterResult, clickResult, favoriteResult, subscriptionResult, profileResult, manualPaymentResult] = await Promise.all([
    fetchPeriodSummary(1),
    fetchPeriodSummary(7),
    fetchPeriodSummary(30),
    supabase.from("analytics_daily_events").select("day,event_count,visitor_count").eq("event_type", "page_view").gte("day", sinceDay).order("day"),
    supabase.from("analytics_daily_filters").select("dimension,value,use_count").gte("day", sinceDay),
    supabase.from("analytics_daily_tender_opens").select("tender_id,tender_title,slug,open_count,visitor_count").gte("day", sinceDay),
    supabase.from("analytics_current_favorites").select("tender_id,tender_title,slug,favorite_count").order("favorite_count", { ascending: false }).limit(10),
    fetchSubscriptionRows(supabase),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    fetchManualPaymentRows(supabase),
  ]);

  const analyticsError = dailyResult.error ?? filterResult.error ?? clickResult.error ?? favoriteResult.error
    ?? profileResult.error;
  if (analyticsError) return null;

  const dailyByDay = new Map(
    ((dailyResult.data ?? []) as DailyEventRow[]).map((row) => [row.day, { views: number(row.event_count), visitors: number(row.visitor_count) }]),
  );
  const trend = Array.from({ length: selectedDays }, (_, index) => {
    const day = dateKey(new Date(Date.now() - (selectedDays - 1 - index) * 24 * 60 * 60 * 1000));
    return { day, views: dailyByDay.get(day)?.views ?? 0, visitors: dailyByDay.get(day)?.visitors ?? 0 };
  });

  const filterTotals = new Map<string, { dimension: string; value: string; count: number }>();
  for (const row of (filterResult.data ?? []) as DailyFilterRow[]) {
    const key = `${row.dimension}\u0000${row.value}`;
    const current = filterTotals.get(key) ?? { dimension: row.dimension, value: row.value, count: 0 };
    current.count += number(row.use_count);
    filterTotals.set(key, current);
  }

  const clickTotals = new Map<string, AnalyticsDashboardData["projectClicks"][number]>();
  for (const row of (clickResult.data ?? []) as DailyTenderRow[]) {
    const current = clickTotals.get(row.tender_id) ?? {
      tenderId: row.tender_id,
      title: row.tender_title,
      slug: row.slug,
      count: 0,
      visitors: 0,
    };
    current.count += number(row.open_count);
    current.visitors += number(row.visitor_count);
    clickTotals.set(row.tender_id, current);
  }

  const subscriptions = subscriptionResult;
  const now = Date.now();
  const periodIsCurrent = (row: SubscriptionRow) => !row.current_period_end || new Date(row.current_period_end).getTime() > now;
  const activeSubscriptions = subscriptions.filter((row) => row.status === "active" && periodIsCurrent(row));
  const trialingSubscriptions = subscriptions.filter((row) => row.status === "trialing" && periodIsCurrent(row));
  const liveSubscriptions = [...activeSubscriptions, ...trialingSubscriptions];
  const activeUsers = new Set(activeSubscriptions.map((row) => row.user_id)).size;
  const trialingUsers = new Set(trialingSubscriptions.map((row) => row.user_id)).size;
  const planTotals = new Map<string, Set<string>>();
  for (const row of liveSubscriptions) {
    const users = planTotals.get(row.plan) ?? new Set<string>();
    users.add(row.user_id);
    planTotals.set(row.plan, users);
  }
  const monthlyListValueUsd = activeSubscriptions.reduce((total, row) => {
    const plan = row.plan as PaidPlan;
    const interval = row.billing_interval as BillingInterval;
    const price = PLAN_PRICES_USD[plan]?.[interval];
    return price ? total + price / BILLING_MONTHS[interval] : total;
  }, 0);
  const manualPayments = manualPaymentResult;
  const manualCollectedUsd = manualPayments
    .filter((row) => row.status === "paid" && row.currency === "USD")
    .reduce((total, row) => total + number(row.amount_minor) / 100, 0);
  const pendingManualPayments = manualPayments.filter((row) => ["pending", "proof_submitted"].includes(row.status) && row.currency === "USD");

  return {
    generatedAt: new Date().toISOString(),
    selectedDays,
    periods: { today, week, month },
    trend,
    filters: [...filterTotals.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    projectClicks: [...clickTotals.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    favorites: ((favoriteResult.data ?? []) as FavoriteRow[]).map((row) => ({
      tenderId: row.tender_id,
      title: row.tender_title,
      slug: row.slug,
      count: number(row.favorite_count),
    })),
    subscriptions: {
      activeUsers,
      trialingUsers,
      registeredUsers: profileResult.count ?? 0,
      byPlan: [...planTotals.entries()].map(([plan, users]) => ({ plan, count: users.size })).sort((a, b) => b.count - a.count),
    },
    payments: {
      activeStripeSubscriptions: new Set(activeSubscriptions.filter((row) => row.payment_source === "stripe").map((row) => row.user_id)).size,
      activeManualSubscriptions: new Set(activeSubscriptions.filter((row) => row.payment_source === "manual").map((row) => row.user_id)).size,
      pastDueSubscriptions: new Set(subscriptions.filter((row) => row.status === "past_due").map((row) => row.user_id)).size,
      monthlyListValueUsd,
      manualCollectedUsd,
      manualPendingUsd: pendingManualPayments.reduce((total, row) => total + number(row.amount_minor) / 100, 0),
      manualPendingRequests: pendingManualPayments.length,
    },
  };
}
