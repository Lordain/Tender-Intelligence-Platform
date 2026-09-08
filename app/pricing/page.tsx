import { PageIntro } from "@/components/layout/PageIntro";
import { PricingPlans } from "@/components/pricing/PricingPlans";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "订阅方案与价格",
  description: "个人版与企业版订阅方案、月度/半年度/年度计费周期与包含功能对比。",
};

export default function PricingPage() {
  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[94rem]">
        <PageIntro eyebrow="Subscription plans" title="订阅服务" description="注册即开启 7 天全功能试用；试用结束后可按个人或企业协作需求订阅。" metrics={[{ label: "注册即享", value: "7", suffix: "天全功能试用" }]} />
        <PricingPlans />
        <p className="mt-7 text-center text-xs leading-6 text-[#7b878e]">所有价格均以美元计价；具体支付周期与服务条款以订阅确认页面为准。</p>
      </div>
    </main>
  );
}
