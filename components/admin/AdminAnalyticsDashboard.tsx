import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AnalyticsDashboardData, AnalyticsPeriod } from "@/lib/db/analytics";

const DIMENSION_LABELS: Record<string, string> = {
  country: "国家/地区",
  industry: "行业",
  scope: "项目类型",
  status: "项目阶段",
  tier: "相关度",
  sort: "排序",
  view: "快捷视图",
  search: "搜索",
};

const VALUE_LABELS: Record<string, string> = {
  Mexico: "墨西哥",
  Colombia: "哥伦比亚",
  flagship: "旗舰大标",
  significant: "重点项目",
  standard: "常规项目",
  planned: "计划中",
  open: "招标中",
  clarification: "澄清中",
  submission_closed: "已截止",
  awarded: "已中标",
  cancelled: "已取消",
  equipment: "设备",
  services: "服务",
  equipment_services: "设备与服务",
  works: "工程/EPC",
  consulting: "咨询",
  deadline_asc: "交标由近到远",
  publication_desc: "最新发布",
  explorer: "探索版",
  professional: "个人版",
  enterprise: "公司版",
  individual: "个人版",
  company: "公司版",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function MetricCard({ label, period }: { label: string; period: AnalyticsPeriod }) {
  return (
    <article className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5">
      <p className="text-xs font-black tracking-[0.08em] text-[#64717c]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#071826]">{formatNumber(period.pageViews)}</p>
      <p className="mt-1 text-xs text-[#7b8991]">{formatNumber(period.visitors)} 位访客</p>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">{children}</p>;
}

export function AdminAnalyticsDashboard({ data, selectedDays }: { data: AnalyticsDashboardData | null; selectedDays: number }) {
  const trackingReady = data !== null;
  const dashboard: AnalyticsDashboardData = data ?? {
    generatedAt: "",
    selectedDays,
    periods: { today: { pageViews: 0, visitors: 0 }, week: { pageViews: 0, visitors: 0 }, month: { pageViews: 0, visitors: 0 } },
    trend: Array.from({ length: selectedDays }, () => ({ day: "", views: 0, visitors: 0 })),
    filters: [], projectClicks: [], favorites: [],
    subscriptions: { activeUsers: 0, trialingUsers: 0, registeredUsers: 0, byPlan: [] },
  };

  const maxViews = Math.max(1, ...dashboard.trend.map((item) => item.views));
  const activeSubscribers = dashboard.subscriptions.activeUsers + dashboard.subscriptions.trialingUsers;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Operations"
        title="运营看板"
        description="查看访问趋势、用户筛选偏好、热门项目、收藏与订阅情况。数据从埋点启用后开始积累。"
        actions={<p className="text-xs font-semibold text-[#7a878f]">{trackingReady ? `更新于 ${new Date(dashboard.generatedAt).toLocaleString("zh-CN")}` : "等待启用"}</p>}
      />

      {!trackingReady && <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4"><p className="text-sm font-black text-[#6d4c0d]">尚未连接统计数据</p><p className="mt-1 text-xs leading-5 text-[#7c6943]">请在 Supabase 执行迁移 0016_product_analytics.sql。看板布局可先预览，启用后数据将从零开始积累。</p></section>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="近 24 小时浏览" period={dashboard.periods.today} />
        <MetricCard label="近 7 天浏览" period={dashboard.periods.week} />
        <MetricCard label="近 30 天浏览" period={dashboard.periods.month} />
        <article className="rounded-2xl bg-[#061b2b] p-5 text-white">
          <p className="text-xs font-black tracking-[0.08em] text-white/58">当前订阅用户</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#ffb21c]">{formatNumber(activeSubscribers)}</p>
          <p className="mt-1 text-xs text-white/52">已注册 {formatNumber(dashboard.subscriptions.registeredUsers)} 位用户</p>
        </article>
      </section>

      <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Traffic trend</p><h2 className="mt-1 text-xl font-black text-[#071826]">浏览趋势</h2></div>
          <nav className="flex rounded-xl bg-[#edf1f2] p-1">
            {[7, 30, 90].map((days) => <Link key={days} href={`/admin/analytics?days=${days}`} className={`rounded-lg px-3 py-2 text-xs font-black ${selectedDays === days ? "bg-white text-[#071826] shadow-sm" : "text-[#71808a]"}`}>{days} 天</Link>)}
          </nav>
        </div>
        <div className="mt-6 flex h-52 items-end gap-1 border-b border-[#dbe2e5] px-1">
          {dashboard.trend.map((item, index) => (
            <div key={`${item.day}-${index}`} className="group relative flex h-full flex-1 items-end" title={trackingReady ? `${item.day}：${item.views} 次浏览，${item.visitors} 位访客` : "尚未启用"}>
              <div className="w-full rounded-t-sm bg-[#ffb21c] transition-colors group-hover:bg-[#d78900]" style={{ height: `${Math.max(item.views ? 4 : 1, (item.views / maxViews) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-semibold text-[#8a969d]"><span>{dashboard.trend[0]?.day}</span><span>{dashboard.trend.at(-1)?.day}</span></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Filter usage</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">常用筛选条件</h2>
          <div className="mt-5 space-y-2">
            {dashboard.filters.length === 0 ? <EmptyState>尚无筛选使用数据</EmptyState> : dashboard.filters.map((item, index) => (
              <div key={`${item.dimension}-${item.value}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[#f3f5f4] px-3 py-3">
                <span className="text-xs font-black text-[#9a6a12]">{index + 1}</span>
                <p className="truncate text-sm font-bold text-[#203847]"><span className="text-[#7a878f]">{DIMENSION_LABELS[item.dimension] ?? item.dimension} · </span>{VALUE_LABELS[item.value] ?? item.value}</p>
                <span className="text-xs font-black text-[#071826]">{formatNumber(item.count)} 次</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Top tenders</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">项目点击 Top 10</h2>
          <div className="mt-5 space-y-2">
            {dashboard.projectClicks.length === 0 ? <EmptyState>尚无项目点击数据</EmptyState> : dashboard.projectClicks.map((item, index) => (
              <Link key={item.tenderId} href={`/tenders/${item.slug}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-transparent bg-[#f3f5f4] px-3 py-3 hover:border-[#ffb21c]">
                <span className="text-xs font-black text-[#9a6a12]">{index + 1}</span>
                <p className="truncate text-sm font-bold text-[#203847]">{item.title}</p>
                <span className="text-right text-xs font-black text-[#071826]">{formatNumber(item.count)} 次<span className="block font-medium text-[#8a969d]">{formatNumber(item.visitors)} 人</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
        <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Favorites</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">收藏最多的项目</h2>
          <div className="mt-5 space-y-2">
            {dashboard.favorites.length === 0 ? <EmptyState>尚无收藏数据</EmptyState> : dashboard.favorites.map((item, index) => (
              <Link key={item.tenderId} href={`/tenders/${item.slug}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[#f3f5f4] px-3 py-3 hover:ring-1 hover:ring-[#ffb21c]">
                <span className="text-xs font-black text-[#9a6a12]">{index + 1}</span><p className="truncate text-sm font-bold text-[#203847]">{item.title}</p><span className="text-xs font-black text-[#071826]">{formatNumber(item.count)} 人</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Subscribers</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">订阅概况</h2>
          <dl className="mt-5 divide-y divide-[#e4e9eb]">
            <div className="flex justify-between py-3 text-sm"><dt className="text-[#64717c]">正式订阅</dt><dd className="font-black text-[#071826]">{dashboard.subscriptions.activeUsers}</dd></div>
            <div className="flex justify-between py-3 text-sm"><dt className="text-[#64717c]">试用订阅</dt><dd className="font-black text-[#071826]">{dashboard.subscriptions.trialingUsers}</dd></div>
            {dashboard.subscriptions.byPlan.map((item) => <div key={item.plan} className="flex justify-between py-3 text-sm"><dt className="text-[#64717c]">{VALUE_LABELS[item.plan] ?? item.plan}</dt><dd className="font-black text-[#071826]">{item.count}</dd></div>)}
          </dl>
          {activeSubscribers === 0 && <p className="mt-4 rounded-xl bg-[#f1f4f4] px-3 py-3 text-xs leading-5 text-[#71808a]">当前处于免费开放阶段，尚无付费订阅属于正常情况。</p>}
        </section>
      </div>
    </div>
  );
}
