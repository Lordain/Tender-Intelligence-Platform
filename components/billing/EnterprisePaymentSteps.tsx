import { BILLING_EMAIL } from "@/lib/support";

/**
 * How a company pays by international wire, in the order it happens. Shown on
 * /pricing, beside the wire option at checkout and on the account page, so a
 * buyer can forward one list to their finance team. Added 2026-09-28 (user:
 * 页面上用中文写清楚「企业如何付款」的步骤).
 *
 * Step 4 repeats the rule from 2026-09-09: the website never shows the bank
 * account; staff send it by email after checking the order.
 */
export const ENTERPRISE_PAYMENT_STEPS = [
  { title: "选择方案和年付", body: "在订阅方案页选择方案，建议选「按年付」：12 个月只收 10 个月费用，一年只需汇款一次。" },
  { title: "提交电汇申请", body: "注册并登录后进入「确认订阅」，用英文或拼音填写公司名称和地址，付款方式选「国际银行电汇」，提交申请。" },
  { title: "下载发票和协议", body: "在「账户管理」页下载英文形式发票（Proforma Invoice）和服务协议，交给财务办理付汇。" },
  { title: "收取汇款信息", body: `工作人员核对资料后，从 ${BILLING_EMAIL} 发送收款银行信息。网站不显示银行账号；收款人必须与形式发票上的卖方一致。` },
  { title: "美元电汇", body: "财务以美元（USD）电汇全款，附言填写申请编号，手续费选 OUR（汇款方承担）。" },
  { title: "提交回执并开通", body: "汇款后在「账户管理」页提交汇款信息。到账核实后开通账户，并开具正式发票。" },
] as const;

export function EnterprisePaymentSteps({ tone = "light", title = "企业如何付款（国际银行电汇）" }: { tone?: "light" | "dark"; title?: string | null }) {
  const dark = tone === "dark";
  return (
    <div className={dark ? "mt-3" : ""}>
      {title && <p className={dark ? "text-xs font-black text-[#ffd16f]" : "text-base font-black text-[#071826]"}>{title}</p>}
      <ol className={dark ? "mt-2 space-y-2" : "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
        {ENTERPRISE_PAYMENT_STEPS.map((step, index) => (
          <li key={step.title} className={dark ? "flex gap-2" : "flex gap-3 rounded-xl bg-white/70 p-4"}>
            <span className={dark
              ? "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#ffb21c] text-[10px] font-black text-[#071826]"
              : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-xs font-black text-white"}>{index + 1}</span>
            <span className={dark ? "text-xs leading-5 text-white/80" : "text-sm leading-6 text-[#425461]"}>
              <strong className={dark ? "text-white" : "text-[#071826]"}>{step.title}：</strong>{step.body}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
