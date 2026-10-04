import { PricingPlans } from "@/components/pricing/PricingPlans";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { InvoiceContact } from "@/components/billing/InvoiceContact";
import { TRIAL_DAYS } from "@/lib/access-control";
import { SUPPORT_WECHAT } from "@/lib/support";
import { EnterprisePaymentSteps } from "@/components/billing/EnterprisePaymentSteps";
import { internationalWireEnabled } from "@/lib/manual-wire";
import { invoiceSeller } from "@/lib/billing/invoice-seller";
// Read from the constant, never retyped: the cards above this line compute
// ¥ from USD_CNY_REFERENCE_RATE, so a literal here goes stale the first time
// the rate is refreshed and the page contradicts its own prices.
import { USD_CNY_REFERENCE_RATE } from "@/lib/billing-catalog";

export const metadata: Metadata = pageMetadata({
  title: "订阅方案与价格",
  description:
    "免费版、基础个人版、专业个人版和专业企业版的月付、年付价格与功能对比；企业可国际电汇对公付款。",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[108rem]">
        {/* A large two-tone headline over one bordered grid, after Vercel's
            pricing page (user, 2026-10-05: 参考Vercel的设计风格帮我优化). The
            trial that PageIntro's metric card showed is now the chip beside
            the billing toggle. */}
        <header className="pt-4 sm:pt-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Subscription plans</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.1] tracking-[-0.045em] text-[#071826] sm:text-6xl">
            订阅服务，
            <br />
            <span className="text-[#8a979f]">按国家与团队选择方案</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#5b6b75]">免费版长期开放；注册后先体验 {TRIAL_DAYS} 天完整项目详情，再选择适合的国家范围和团队方案。</p>
        </header>
        <PricingPlans />
        {internationalWireEnabled() && (
          <section id="enterprise-payment" className="mt-6 rounded-2xl border border-[#dde3e4] bg-[#fbfaf6] px-5 py-6 sm:px-8">
            <EnterprisePaymentSteps documents={invoiceSeller() !== null} />
            {invoiceSeller() !== null && <p className="mt-4 text-xs leading-6 text-[#64717c]">形式发票和服务协议为中英文对照，工作人员联系确认后在账户页下载；正式发票在到账后开具。</p>}
          </section>
        )}
        <div className="mt-6 rounded-2xl border border-[#dde3e4] bg-white px-5 py-6 text-[#425461] sm:px-8">
          <p className="flex items-center gap-2 text-base font-black text-[#071826]"><span className="size-2 rounded-full bg-[#ffb21c]" aria-hidden="true" />需要微信付款？请先联系我们</p>
          <p className="mt-2 text-sm leading-7">微信 ID：<span className="select-all font-black text-[#071826]">{SUPPORT_WECHAT}</span>。请告知所选套餐及注册邮箱；确认付款金额与收款方式后，工作人员核实到账，再从后台人工开通。微信联系或提供付款截图不等于已开通权限。</p>
        </div>
        <p className="mt-10 text-center text-xs leading-6 text-[#64717c]">人民币金额仅供参考：按人民币汇率 1 美元 ≈ {USD_CNY_REFERENCE_RATE} 元人民币估算。实际支付以美元价格及付款时适用汇率为准。</p>
        <p className="text-center text-xs leading-6 text-[#64717c]">所有价格均以美元计价并已包含依法适用的税费；银行转账在确认付款方式后显示锁定的 MXN 金额。具体支付周期与服务条款以订阅确认页面为准。</p>
        <InvoiceContact compact />
      </div>
    </main>
  );
}
