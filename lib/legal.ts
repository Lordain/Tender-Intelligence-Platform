import "server-only";
import { SUPPORT_EMAIL } from "@/lib/support";

function clean(value: string | undefined) {
  return value?.trim() || null;
}

/**
 * Mexican privacy law requires the data controller's identity and domicile
 * in the privacy notice.
 *
 * Until the operating company exists the pages name the team behind the
 * site (2026-09-25, user's choice): the earlier 【运营主体法定名称，待补充】
 * placeholder was printed on the live terms and privacy pages for every
 * visitor to read. Setting LEGAL_OPERATOR_NAME in Vercel replaces this
 * everywhere with no code change — and has to happen once the company is
 * registered, for the same LFPDPPP reason as the address below.
 */
export const LEGAL_OPERATOR_NAME = clean(process.env.LEGAL_OPERATOR_NAME) || "拉美招投标信息平台（latintender.com）运营团队";

/**
 * Null until the operating company exists (2026-09-11, explicit request:
 * 先拿掉注册地址，等有公司再补).
 *
 * Null, not a placeholder: a legal notice that prints 【待补充】 where the
 * domicile belongs looks unfinished to every visitor, while a sentence that
 * simply omits a clause still reads as a complete document. The pages that
 * consume this drop the clause rather than rendering an empty string — so
 * setting LEGAL_OPERATOR_ADDRESS later restores it everywhere with no code
 * change, which is what makes omitting it safe to do now.
 *
 * It does have to come back before this is a real production legal notice:
 * LFPDPPP requires the Responsable's domicile in the privacy notice.
 */
export const LEGAL_OPERATOR_ADDRESS = clean(process.env.LEGAL_OPERATOR_ADDRESS);
export const LEGAL_CONTACT_EMAIL = SUPPORT_EMAIL;
