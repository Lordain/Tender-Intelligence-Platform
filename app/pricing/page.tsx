import Link from "next/link";
import { PageIntro } from "@/components/layout/PageIntro";

const PLANS = [
  {
    id: "individual",
    eyebrow: "个人使用",
    name: "个人版",
    description: "适合独立负责市场机会搜寻与投标准备的专业人士。",
    monthly: "$1,000",
    halfYear: "$5,400",
    halfYearAverage: "平均 $900/月",
    halfYearSaving: "省下 10%",
    yearly: "$9,600",
    yearlyAverage: "平均 $800/月",
    yearlySaving: "省下 20%",
    notificationSchedule: "每日 2 个时段",
    features: [
      "招标项目搜索与单行业筛选",
      "1 个账户登录",
      "查看全部招标项目",
      "完整标书详情与招投标时间",
      "查看投标要求、资质要求、风险点与官方入口",
      "旗舰标标签筛选",
    ],
  },
  {
    id: "company",
    eyebrow: "团队协作",
    name: "公司版",
    description: "适合需要多人协作、覆盖多个业务方向的企业团队。",
    monthly: "$2,000",
    halfYear: "$10,800",
    halfYearAverage: "平均 $1,800/月",
    halfYearSaving: "省下 10%",
    yearly: "$19,200",
    yearlyAverage: "平均 $1,600/月",
    yearlySaving: "省下 20%",
    notificationSchedule: "每日 3 个时段",
    features: [
      "招标项目搜索与多行业组合筛选",
      "最多 3 个账户登录",
      "查看全部招标项目",
      "完整标书详情与招投标时间",
      "查看投标要求、资质要求、风险点与官方入口",
      "旗舰标标签筛选",
    ],
  },
] as const;

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-none stroke-current stroke-2.2">
      <path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 fill-none stroke-current stroke-1.8">
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <path d="M7 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[94rem]">
        <PageIntro
          eyebrow="Subscription plans"
          title="订阅服务"
          description="为个人与企业团队提供清晰的使用方案，按实际协作与筛选需求选择。"
          metrics={[{ label: "当前阶段", value: "免费", suffix: "开放" }]}
        />

        <section className="mt-5 rounded-2xl border border-[#d9e0e2] bg-[#fffdf9] px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6">
          <div>
            <p className="text-sm font-black text-[#071826]">免费开放期间</p>
            <p className="mt-1 text-sm leading-6 text-[#64717c]">无需选择套餐或填写付款信息，即可使用除新标邮件通知外的核心功能。</p>
          </div>
          <Link href="/register" className="mt-4 inline-flex shrink-0 items-center justify-center rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] sm:mt-0">
            免费注册使用
          </Link>
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          {PLANS.map((plan) => (
            <article key={plan.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] shadow-[0_24px_60px_-48px_rgba(6,27,43,.5)]">
              <div className="border-b border-[#e2e7e9] p-6 sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">{plan.eyebrow}</p>
                <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-3xl font-black tracking-[-0.035em] text-[#071826]">{plan.name}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#64717c]">{plan.description}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[#edf2f3] px-3 py-1.5 text-xs font-bold text-[#425461]">
                    {plan.id === "company" ? "未开放" : "当前免费"}
                  </span>
                </div>

                <div className="mt-7 flex items-end gap-2">
                  <span className="text-5xl font-black tracking-[-0.05em] text-[#071826]">{plan.monthly}</span>
                  <span className="pb-1 text-sm font-semibold text-[#64717c]">USD + 16% IVA税 / 月</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#dbe2e5] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#64717c]">半年订阅</p>
                      <span className="rounded-full bg-[#edf2f3] px-2 py-0.5 text-[10px] font-black text-[#425461]">{plan.halfYearSaving}</span>
                    </div>
                    <p className="mt-1.5 text-xl font-black text-[#071826]">{plan.halfYear}<span className="text-xs font-semibold text-[#64717c]"> + 16% IVA税</span></p>
                    <p className="mt-1 text-[11px] font-semibold text-[#b86e00]">{plan.halfYearAverage}</p>
                  </div>
                  <div className="rounded-xl border border-[#e7b84e] bg-[#fff8e9] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#64717c]">年度订阅</p>
                      <span className="rounded-full bg-[#ffb21c] px-2 py-0.5 text-[10px] font-black text-[#071826]">{plan.yearlySaving}</span>
                    </div>
                    <p className="mt-1.5 text-xl font-black text-[#071826]">{plan.yearly}<span className="text-xs font-semibold text-[#64717c]"> + 16% IVA税</span></p>
                    <p className="mt-1 text-[11px] font-semibold text-[#b86e00]">{plan.yearlyAverage}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <h3 className="text-sm font-black text-[#071826]">方案包含</h3>
                <ul className="mt-5 flex flex-1 flex-col gap-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[#425461]">
                      <span className="text-[#b86e00]"><CheckIcon /></span>
                      <span>{feature}</span>
                    </li>
                  ))}
                  <li className="mt-1 flex items-start gap-3 rounded-xl bg-[#f2f4f3] px-3.5 py-3 text-sm leading-6 text-[#6e7b83]">
                    <span className="mt-0.5"><LockIcon /></span>
                    <span className="flex-1">新标通知与邮件提醒（{plan.notificationSchedule}）</span>
                    <span className="shrink-0 rounded-full border border-[#cbd4d8] bg-white px-2 py-0.5 text-[10px] font-bold">暂未开放</span>
                  </li>
                </ul>

                <Link href="/register" className="mt-7 rounded-xl bg-[#061b2b] px-5 py-3 text-center text-sm font-black text-white transition-colors hover:bg-[#0a2b40]">
                  当前免费使用
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-7 text-center text-xs leading-6 text-[#7b878e]">
          页面价格为正式订阅启用后的预定价格，均以美元计价并另加16% IVA税。收费开放前不会自动扣费，具体启用时间将另行通知。
        </p>
      </div>
    </main>
  );
}
