import type { UserActivity } from "@/lib/db/user-activity";

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function UserActivitySection({ activity }: { activity: UserActivity | null }) {
  return (
    <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Registered users</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">注册用户活跃度</h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-[#7a878f] sm:text-right">
          每位注册用户一行，统计的是该账号登录后的全部记录（不受上方天数限制）。不含管理员、测试邮箱和在内部设备上用过的账号。时间为北京时间。邮箱仅在后台显示。
        </p>
      </div>

      {activity === null ? (
        <p className="mt-5 rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">暂时无法读取用户活跃度</p>
      ) : activity.rows.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">还没有外部注册用户</p>
      ) : (
        <>
          {activity.truncated && <p className="mt-4 rounded-xl bg-[#fff7df] px-4 py-3 text-xs font-bold text-[#7a5b16]">记录过多，只统计了最早的 50,000 条。</p>}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e1e7e9] text-[#64717c]">
                  <th className="py-2 pr-3 font-bold">用户</th>
                  <th className="px-3 py-2 font-bold">注册时间</th>
                  <th className="px-3 py-2 font-bold">最近访问</th>
                  <th className="px-3 py-2 text-right font-bold">页面数</th>
                  <th className="px-3 py-2 text-right font-bold">打开项目</th>
                  <th className="px-3 py-2 text-right font-bold">收藏</th>
                  <th className="px-3 py-2 font-bold">用过的筛选</th>
                  <th className="py-2 pl-3 font-bold">邮件通知</th>
                </tr>
              </thead>
              <tbody>
                {activity.rows.map((row) => (
                  <tr key={row.userId} className="border-b border-[#eef2f3] align-top text-[#203847]">
                    <td className="py-3 pr-3 font-bold break-all">{row.email ?? "（无邮箱）"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.signedUpAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatTime(row.lastSeenAt)}</td>
                    <td className="px-3 py-3 text-right font-black text-[#071826]">{row.pageViews}</td>
                    <td className="px-3 py-3 text-right font-black text-[#071826]">{row.tendersOpened}</td>
                    <td className="px-3 py-3 text-right font-black text-[#071826]">{row.tendersSaved}</td>
                    <td className="px-3 py-3 leading-5">{row.filters.length > 0 ? row.filters.map((item) => <span key={item} className="block">{item}</span>) : "—"}</td>
                    <td className="py-3 pl-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-1 font-black ${row.emailNotifications ? "bg-[#edf7f1] text-[#087a52]" : "bg-[#edf1f2] text-[#71808a]"}`}>{row.emailNotifications ? "已开启" : "未开启"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
