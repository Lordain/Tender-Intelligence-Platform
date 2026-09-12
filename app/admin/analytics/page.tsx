import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";
import { fetchAnalyticsDashboard } from "@/lib/db/analytics";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const data = await fetchAnalyticsDashboard(days).catch(() => null);
  return <AdminAnalyticsDashboard data={data} selectedDays={days} />;
}
