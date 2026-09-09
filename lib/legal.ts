import "server-only";
import { SUPPORT_EMAIL } from "@/lib/support";

function clean(value: string | undefined) {
  return value?.trim() || null;
}

// Mexican privacy law requires the data controller's identity and domicile
// in the privacy notice. Keep conspicuous fallbacks so an incomplete
// production configuration cannot be mistaken for a finished legal notice.
export const LEGAL_OPERATOR_NAME = clean(process.env.LEGAL_OPERATOR_NAME) || "【运营主体法定名称，待补充】";
export const LEGAL_OPERATOR_ADDRESS = clean(process.env.LEGAL_OPERATOR_ADDRESS) || "【运营主体法定地址，待补充】";
export const LEGAL_CONTACT_EMAIL = SUPPORT_EMAIL;
