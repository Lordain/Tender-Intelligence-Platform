import { cookies } from "next/headers";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";
import { INTERNAL_TRAFFIC_COOKIE } from "@/lib/analytics-internal";
import { fetchAnalyticsDashboard, type TrafficScope } from "@/lib/db/analytics";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const scope: TrafficScope = ["external", "internal", "all"].includes(params.scope ?? "")
    ? params.scope as TrafficScope
    : "external";
  const [data, cookieStore] = await Promise.all([
    fetchAnalyticsDashboard(days, scope).catch(() => null),
    cookies(),
  ]);
  const internalDeviceMarked = cookieStore.get(INTERNAL_TRAFFIC_COOKIE)?.value === "1";
  return <AdminAnalyticsDashboard data={data} selectedDays={days} trafficScope={scope} internalDeviceMarked={internalDeviceMarked} />;
}
