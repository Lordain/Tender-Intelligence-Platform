function clean(value: string | undefined) {
  return value?.trim() || null;
}

export const SUPPORT_EMAIL = clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || "support@latintender.com";
export const BILLING_EMAIL = clean(process.env.NEXT_PUBLIC_BILLING_EMAIL) || "billing@latintender.com";
export const SUPPORT_WHATSAPP = clean(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)?.replace(/[^\d]/g, "") || "525519103724";

/**
 * The WeChat ID, shown ahead of WhatsApp everywhere both appear.
 *
 * WhatsApp was the only chat channel until 2026-09-15, and it is a Mexican
 * number — right for the supplier side of this business and wrong for the
 * customers, who are mainland Chinese enterprises that do not use WhatsApp.
 * A buyer who wants to ask a question before paying a monthly subscription has no
 * way to reach anyone in the app they actually use.
 *
 * Deliberately not a link. weixin:// only resolves on a phone with the app
 * installed and does nothing on desktop, where most of this traffic reads
 * the pricing page, so a dead link would be worse than plain text. The id is
 * rendered select-all instead: one click takes the whole string, ready to
 * paste into WeChat's search.
 */
export const SUPPORT_WECHAT = clean(process.env.NEXT_PUBLIC_SUPPORT_WECHAT) || "Latin-tender";

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
