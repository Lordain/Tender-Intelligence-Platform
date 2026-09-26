import type { AcquisitionFunnel } from "@/lib/analytics-funnel";

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function share(part: number, whole: number) {
  if (whole === 0) return "—";
  const percent = (part / whole) * 100;
  return `${percent < 10 && percent > 0 ? percent.toFixed(1) : Math.round(percent)}%`;
}

export function AcquisitionFunnelSection({ funnel, selectedDays }: { funnel: AcquisitionFunnel | null; selectedDays: number }) {
  return (
    <section className="rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">Acquisition funnel</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">获客来源与注册转化</h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-[#7a878f] sm:text-right">
          近 {selectedDays} 天，只统计外部访客：不含已标记的内部设备、管理员账号、测试邮箱，以及在内部设备上用过的账号和登录过这些账号的浏览器。一个浏览器算一位访客。
        </p>
      </div>

      {funnel === null ? (
        <p className="mt-5 rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">暂时无法读取漏斗数据</p>
      ) : (
        <>
          {funnel.truncated && <p className="mt-4 rounded-xl bg-[#fff7df] px-4 py-3 text-xs font-bold text-[#7a5b16]">本期浏览记录过多，只统计了最早的 50,000 次浏览；请缩短时间范围。</p>}

          <div className="mt-5 grid gap-2">
            {funnel.stages.map((stage) => (
              <div key={stage.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_7rem]">
                <p className="truncate text-sm font-bold text-[#203847]">{stage.label}</p>
                <div className="h-3 overflow-hidden rounded-full bg-[#edf1f2]">
                  <div className="h-full rounded-full bg-[#ffb21c]" style={{ width: `${funnel.visitors === 0 ? 0 : Math.max(stage.count ? 2 : 0, Math.min(100, (stage.count / funnel.visitors) * 100))}%` }} />
                </div>
                <p className="text-right text-xs font-black text-[#071826]">
                  {formatNumber(stage.count)}
                  <span className="ml-1 font-medium text-[#8a969d]">{stage.key === "visitors" ? "人" : share(stage.count, funnel.visitors)}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-[#7a878f]">注册即自动开始免费试用，所以「完成注册」也是开始试用的人数。</p>
          {funnel.unlinkedSignups > 0 && (
            <p className="mt-3 text-xs leading-5 text-[#7a878f]">其中 {funnel.unlinkedSignups} 个新账号找不到对应的访问记录（浏览器可能拦截了统计），未计入下方来源表。</p>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#071826]">访客来源</h3>
              {funnel.sources.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">本期还没有外部访客</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-[#e1e7e9]">
                  <table className="w-full min-w-[34rem] text-left text-xs">
                    <thead className="bg-[#f3f5f4] text-[#64717c]">
                      <tr>
                        <th className="px-3 py-2 font-bold">来源</th>
                        <th className="px-3 py-2 text-right font-bold">访客</th>
                        <th className="px-3 py-2 text-right font-bold">2 页以上</th>
                        <th className="px-3 py-2 text-right font-bold">看详情</th>
                        <th className="px-3 py-2 text-right font-bold">到注册页</th>
                        <th className="px-3 py-2 text-right font-bold">注册</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e4e9eb]">
                      {funnel.sources.map((source) => (
                        <tr key={source.key}>
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-[#203847]">{source.label}</p>
                            {source.examples.length > 0 && <p className="mt-0.5 break-all text-[11px] text-[#8a969d]">{source.examples.join("、")}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-black text-[#071826]">{formatNumber(source.visitors)}</td>
                          <td className="px-3 py-2.5 text-right text-[#425461]">{formatNumber(source.engaged)}</td>
                          <td className="px-3 py-2.5 text-right text-[#425461]">{formatNumber(source.detail)}</td>
                          <td className="px-3 py-2.5 text-right text-[#425461]">{formatNumber(source.register)}</td>
                          <td className="px-3 py-2.5 text-right font-black text-[#087a52]">{formatNumber(source.signups)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11px] leading-5 text-[#8a969d]">
                来源按访客在本期第一次带来源记录的访问判断。分享链接时加上 ?utm_source=wechat（或 linkedin、email 等），就能在这里单独统计；微信内打开通常不带来源网址，会按微信内置浏览器识别。
              </p>
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#071826]">落地页</h3>
              <div className="mt-3 space-y-2">
                {funnel.landings.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#cbd4d8] px-4 py-8 text-center text-sm text-[#7a878f]">本期还没有外部访客</p>
                ) : funnel.landings.map((landing) => (
                  <div key={landing.page} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[#f3f5f4] px-3 py-3">
                    <p className="truncate text-sm font-bold text-[#203847]">{landing.page}</p>
                    <span className="text-right text-xs font-black text-[#071826]">
                      {formatNumber(landing.visitors)} 人
                      <span className="block font-medium text-[#8a969d]">只看 1 页 {share(landing.singlePage, landing.visitors)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
