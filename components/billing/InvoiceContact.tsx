import { BILLING_EMAIL, invoiceEmailHref, invoiceWhatsAppHref, SUPPORT_WECHAT, SUPPORT_WHATSAPP } from "@/lib/support";

export function InvoiceContact({ accountEmail, compact = false }: { accountEmail?: string | null; compact?: boolean }) {
  const emailHref = invoiceEmailHref(accountEmail);
  const whatsappHref = invoiceWhatsAppHref(accountEmail);
  if (!emailHref && !whatsappHref && !SUPPORT_WECHAT) return null;

  return (
    <section className={compact ? "mt-6 text-center" : "mt-8 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6"}>
      <h2 className={compact ? "text-sm font-black text-[#071826]" : "text-lg font-black text-[#071826]"}>需要发票？</h2>
      <p className="mt-2 text-xs leading-6 text-[#64717c]">付款完成后通过微信、邮箱或 WhatsApp 联系我们，并提供账户邮箱及开票资料，我们将人工为您开具 CFDI 发票。</p>
      <div className={`mt-4 flex flex-wrap items-center gap-3 ${compact ? "justify-center" : ""}`}>
        {/* WeChat first: the customers are Chinese enterprises, and this is the
            one channel they all already have open. Not a link — see SUPPORT_WECHAT. */}
        {SUPPORT_WECHAT && (
          <span className="inline-flex items-center gap-2 rounded-xl border border-[#b8c7cd] bg-white px-4 py-2.5 text-xs font-black text-[#071826]">
            微信
            <span className="select-all font-mono tracking-wide text-[#07863f]">{SUPPORT_WECHAT}</span>
          </span>
        )}
        {emailHref && (
          <a href={emailHref} className="rounded-xl bg-[#061b2b] px-4 py-2.5 text-xs font-black text-white hover:bg-[#0a2b40]">
            邮箱联系{BILLING_EMAIL ? ` · ${BILLING_EMAIL}` : ""}
          </a>
        )}
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-xl border border-[#b8c7cd] bg-white px-4 py-2.5 text-xs font-black text-[#071826] hover:border-[#25d366]">
            WhatsApp 联系{SUPPORT_WHATSAPP ? ` · +${SUPPORT_WHATSAPP}` : ""}
          </a>
        )}
      </div>
    </section>
  );
}
