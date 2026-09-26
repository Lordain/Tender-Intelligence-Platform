import { PageIntro } from "@/components/layout/PageIntro";
import { PricingPlans } from "@/components/pricing/PricingPlans";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { InvoiceContact } from "@/components/billing/InvoiceContact";
import { TRIAL_DAYS } from "@/lib/access-control";
import { SUPPORT_WECHAT } from "@/lib/support";
// Read from the constant, never retyped: the cards above this line compute
// ¥ from USD_CNY_REFERENCE_RATE, so a literal here goes stale the first time
// the rate is refreshed and the page contradicts its own prices.
import { USD_CNY_REFERENCE_RATE } from "@/lib/billing-catalog";

export const metadata: Metadata = pageMetadata({
  title: "订阅方案与价格",
  description:
    "免费版、基础个人版、专业个人版和专业企业版的月度价格与功能对比。",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[108rem]">
        <PageIntro eyebrow="Subscription plans" title="订阅服务" description={`免费版长期开放；注册后先体验 ${TRIAL_DAYS} 天完整项目详情，再选择适合的国家范围和团队方案。`} metrics={[{ label: "注册即享", value: String(TRIAL_DAYS), suffix: "天试用" }]} />
        <PricingPlans />
        <div className="mt-6 rounded-2xl border border-[#e9b949] bg-[#fff3d4] px-5 py-5 text-[#5f4300] sm:px-6">
          <p className="text-base font-black">需要微信付款？请先联系我们</p>
          <p className="mt-2 text-sm leading-7">微信 ID：<span className="select-all font-black">{SUPPORT_WECHAT}</span>。请告知所选套餐及注册邮箱；确认付款金额与收款方式后，工作人员核实到账，再从后台人工开通。微信联系或提供付款截图不等于已开通权限。</p>
        </div>
        <p className="mt-6 text-center text-xs leading-6 text-[#64717c]">人民币金额仅供参考：按人民币汇率 1 美元 ≈ {USD_CNY_REFERENCE_RATE} 元人民币估算。实际支付以美元价格及付款时适用汇率为准。</p>
        <p className="mt-7 text-center text-xs leading-6 text-[#7b878e]">所有价格均以美元计价并已包含依法适用的税费；银行转账在确认付款方式后显示锁定的 MXN 金额。具体支付周期与服务条款以订阅确认页面为准。</p>
        <InvoiceContact compact />
      </div>
    </main>
  );
}
