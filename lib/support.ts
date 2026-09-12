function clean(value: string | undefined) {
  return value?.trim() || null;
}

export const SUPPORT_EMAIL = clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || "support@latintender.com";
export const BILLING_EMAIL = clean(process.env.NEXT_PUBLIC_BILLING_EMAIL) || "billing@latintender.com";
export const SUPPORT_WHATSAPP = clean(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)?.replace(/[^\d]/g, "") || "525519103724";

export function invoiceEmailHref(accountEmail?: string | null) {
  if (!BILLING_EMAIL) return null;
  const subject = "申请 CFDI 发票";
  const body = accountEmail ? `您好，我需要为订阅付款申请 CFDI。\n\n账户邮箱：${accountEmail}` : "您好，我需要为订阅付款申请 CFDI。";
  return `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function invoiceWhatsAppHref(accountEmail?: string | null) {
  if (!SUPPORT_WHATSAPP) return null;
  const text = accountEmail
    ? `您好，我需要为订阅付款申请 CFDI。账户邮箱：${accountEmail}`
    : "您好，我需要为订阅付款申请 CFDI。";
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
