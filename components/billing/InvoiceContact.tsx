import { BILLING_EMAIL, invoiceEmailHref, invoiceWhatsAppHref, SUPPORT_WHATSAPP } from "@/lib/support";

export function InvoiceContact({ accountEmail, compact = false }: { accountEmail?: string | null; compact?: boolean }) {
  const emailHref = invoiceEmailHref(accountEmail);
  const whatsappHref = invoiceWhatsAppHref(accountEmail);
  if (!emailHref && !whatsappHref) return null;

  return (
    <section className={compact ? "mt-6 text-center" : "mt-8 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6"}>
      <h2 className={compact ? "text-sm font-black text-[#071826]" : "text-lg font-black text-[#071826]"}>需要 CFDI 发票？</h2>
      <p className="mt-2 text-xs leading-6 text-[#64717c]">付款完成后通过邮箱或 WhatsApp 联系我们，并提供账户邮箱及开票资料，我们将人工为您开具。</p>
      <div className={`mt-4 flex flex-wrap gap-3 ${compact ? "justify-center" : ""}`}>
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
