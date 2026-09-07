import Link from "next/link";
import { PageIntro } from "@/components/layout/PageIntro";

const PLANS = [
  {
    id: "trial", eyebrow: "注册即享", name: "免费试用 7 天", description: "功能与个人版相同，注册后自动开启，无需绑定银行卡。", monthly: null,
    features: ["招标项目搜索与筛选", "1 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "投标要求、资质、风险与官方入口", "新标通知与邮件提醒（每日 2 个时段）"],
  },
  {
    id: "professional", eyebrow: "个人使用", name: "个人版", description: "适合独立负责市场机会搜寻与投标准备的专业人士。", monthly: "$1,000", halfYear: "$5,400", yearly: "$9,600",
    features: ["招标项目搜索与单行业筛选", "1 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "投标要求、资质、风险与官方入口", "新标通知与邮件提醒（每日 2 个时段）"],
  },
  {
    id: "enterprise", eyebrow: "团队协作", name: "企业版", description: "适合多人协作、覆盖多个业务方向的企业团队。", monthly: "$2,000", halfYear: "$10,800", yearly: "$19,200",
    features: ["招标项目搜索与多行业组合筛选", "最多 3 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "不同账号可设置不同通知条件", "新标通知与邮件提醒（每日 2 个时段）"],
  },
] as const;

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-none stroke-current stroke-2.2"><path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function PricingPage() {
  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[94rem]">
        <PageIntro eyebrow="Subscription plans" title="订阅服务" description="注册即开启 7 天全功能试用；试用结束后可按个人或企业协作需求订阅。" metrics={[{ label: "注册即享", value: "7", suffix: "天全功能试用" }]} />
        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <article key={plan.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-[#fffdf9] shadow-[0_24px_60px_-48px_rgba(6,27,43,.5)] ${plan.id === "trial" ? "border-[#e7b84e]" : "border-[#d8e0e3]"}`}>
              <div className="border-b border-[#e2e7e9] p-6 sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">{plan.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071826]">{plan.name}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#64717c]">{plan.description}</p>
                {plan.monthly ? (
                  <><div className="mt-7 flex items-end gap-2"><span className="text-4xl font-black text-[#071826]">{plan.monthly}</span><span className="pb-1 text-sm font-semibold text-[#64717c]">USD / 月</span></div>
                  <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#dbe2e5] bg-white p-3"><p className="text-xs font-bold text-[#64717c]">半年订阅</p><p className="mt-1 text-lg font-black text-[#071826]">{plan.halfYear}</p></div><div className="rounded-xl border border-[#e7b84e] bg-[#fff8e9] p-3"><p className="text-xs font-bold text-[#64717c]">年度订阅</p><p className="mt-1 text-lg font-black text-[#071826]">{plan.yearly}</p></div></div></>
                ) : <div className="mt-7 rounded-2xl bg-[#fff4d8] p-4 text-sm font-black text-[#8a5700]">7 天内完整体验个人版全部功能</div>}
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-7">
                <h3 className="text-sm font-black text-[#071826]">方案包含</h3>
                <ul className="mt-5 flex flex-1 flex-col gap-3.5">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[#425461]"><span className="text-[#b86e00]"><CheckIcon /></span><span>{feature}</span></li>)}</ul>
                <Link href={plan.id === "trial" ? "/register" : "/login?next=/pricing"} className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-black transition-colors ${plan.id === "trial" ? "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]" : "bg-[#061b2b] text-white hover:bg-[#0a2b40]"}`}>
                  {plan.id === "trial" ? "注册并开始免费试用" : "订阅"}
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-7 text-center text-xs leading-6 text-[#7b878e]">所有价格均以美元计价；具体支付周期与服务条款以订阅确认页面为准。</p>
      </div>
    </main>
  );
}
