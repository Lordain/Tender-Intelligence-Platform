import { ANNUAL_SAVING_PERCENT } from "@/lib/billing-catalog";
import { BILLING_EMAIL } from "@/lib/support";

/**
 * How a company pays by international wire, in the order it happens: four
 * short steps (user, 2026-09-28: 页面上用中文写清楚「企业如何付款」的步骤; then
 * 讲的太复杂了，而且还重复). Shown once per page — /pricing, below the
 * checkout form, and folded on the account page.
 *
 * Step 4 keeps the rule from 2026-09-09: the bank account arrives by email
 * from staff, never on the website.
 */
const DOCUMENTS_STEP = { title: "下载文件", body: "联系确认后，在账户页下载中英文形式发票和服务协议，交财务付汇。" };

/**
 * The steps, with the document download only when it is switched on (the
 * seller is configured — lib/billing/invoice-seller.ts). The user held it
 * back on 2026-09-28 (先不开放下载，等我设置后再说), so until then the page
 * does not promise a file nobody can download.
 */
export function enterprisePaymentSteps(documents: boolean) {
  return [
    { title: "选方案", body: `建议选「按年付」，省 ${ANNUAL_SAVING_PERCENT}%，一年只需汇款一次。` },
    { title: "提交申请", body: "在确认订阅页选「国际银行电汇」并提交，工作人员会联系你。" },
    ...(documents ? [DOCUMENTS_STEP] : []),
    { title: "汇款开通", body: `按 ${BILLING_EMAIL} 邮件发来的收款信息以美元电汇，附言写申请编号；到账后开通。` },
  ];
}

export function EnterprisePaymentSteps({ title = "企业如何付款（国际银行电汇）", documents }: { title?: string | null; documents: boolean }) {
  const steps = enterprisePaymentSteps(documents);
  return (
    <div>
      {title && <p className="text-base font-black text-[#071826]">{title}</p>}
      <ol className={`mt-4 grid gap-3 sm:grid-cols-2 ${steps.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-xl bg-white/70 p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-xs font-black text-white">{index + 1}</span>
            <span className="text-sm leading-6 text-[#425461]">
              <strong className="text-[#071826]">{step.title}：</strong>{step.body}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
