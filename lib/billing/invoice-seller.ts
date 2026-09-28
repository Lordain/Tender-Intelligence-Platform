import "server-only";
import { isPdfLatinText } from "@/lib/billing/pdf-text";
import { BILLING_EMAIL } from "@/lib/support";

export type InvoiceSeller = {
  name: string;
  /** Printed one line per entry; set with " | " between lines in the variable. */
  addressLines: string[];
  taxId: string | null;
  email: string;
};

function clean(value: string | undefined): string | null {
  return value?.trim() || null;
}

/**
 * The seller printed on the wire documents: the legal entity whose name the
 * beneficiary account carries, because the documents tell the payer not to
 * pay any other name.
 *
 *   INVOICE_SELLER_NAME       e.g. "Example Servicios S.A. de C.V."
 *   INVOICE_SELLER_ADDRESS    lines separated by " | "
 *   INVOICE_SELLER_TAX_ID     the RFC, optional
 *
 * LEGAL_OPERATOR_NAME / LEGAL_OPERATOR_ADDRESS (lib/legal.ts) stand in when
 * they are set and printable. Without a name and an address the documents are
 * not offered at all — a proforma invoice with a placeholder seller would be
 * worse than none, since a finance team files it.
 */
export function invoiceSeller(): InvoiceSeller | null {
  const name = [clean(process.env.INVOICE_SELLER_NAME), clean(process.env.LEGAL_OPERATOR_NAME)].find((value) => value && isPdfLatinText(value));
  const address = [clean(process.env.INVOICE_SELLER_ADDRESS), clean(process.env.LEGAL_OPERATOR_ADDRESS)].find((value) => value && isPdfLatinText(value));
  const taxId = clean(process.env.INVOICE_SELLER_TAX_ID);
  if (!name || !address) return null;
  return {
    name,
    addressLines: address.split("|").map((line) => line.trim()).filter(Boolean),
    taxId: taxId && isPdfLatinText(taxId) ? taxId : null,
    email: BILLING_EMAIL,
  };
}
