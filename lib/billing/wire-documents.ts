/**
 * The two documents a company's finance team needs to pay a subscription by
 * international wire: a proforma invoice and a short service agreement, both
 * in English (user, 2026-09-28: 客户选择电汇后，自动生成英文形式发票和简版服务协议
 * PDF，客户可以直接交给财务).
 *
 * Built on demand from the wire request and the buyer's billing profile, so
 * nothing is stored. Neither document carries bank details: since 2026-09-09
 * (8d33ee2) the receiving account is only ever sent by staff, by email, after
 * they have checked the order, and the documents say so — together with the
 * one fact a payer can check, that the beneficiary must be the seller named
 * here. Printed in the standard Helvetica, so every string must pass
 * isPdfLatinText (lib/billing/pdf-text.ts); the wire route enforces that for
 * what the buyer types.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaidInterval, PaidPlan } from "@/lib/billing-catalog";
import { ANNUAL_MONTHS_CHARGED } from "@/lib/billing-catalog";
import { isPdfLatinText } from "@/lib/billing/pdf-text";
import type { InvoiceSeller } from "@/lib/billing/invoice-seller";

export type WireDocumentBuyer = {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  /** ISO 3166 alpha-2. */
  country: string;
  taxId: string | null;
  billingEmail: string;
};

export type WireDocumentOrder = {
  reference: string;
  plan: PaidPlan;
  interval: PaidInterval;
  amountUsd: number;
  /** When the request was made; the documents' issue date. */
  issuedAt: Date;
  /** The login the subscription is activated on. */
  accountEmail: string;
};

export type WireDocumentInput = { seller: InvoiceSeller; buyer: WireDocumentBuyer; order: WireDocumentOrder; siteOrigin: string };

export const PLAN_NAMES_EN: Record<PaidPlan, string> = {
  basic: "Basic Individual",
  professional: "Professional Individual",
  enterprise: "Professional Enterprise",
};

const PLAN_SCOPE_EN: Record<PaidPlan, string> = {
  basic: "1 user account; full tender details and document analysis for one selected country",
  professional: "1 user account; full tender details and document analysis for all covered countries",
  enterprise: "3 user accounts; full tender details and document analysis for all covered countries; monthly industry report",
};

const TERM_EN: Record<PaidInterval, string> = { monthly: "1 month", annual: "12 months" };

export class WireDocumentTextError extends Error {}

export function formatUsd(amount: number): string {
  return `USD ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "S.A. de C.V." already ends a sentence; anything else gets its full stop. */
function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function buyerAddressLines(buyer: WireDocumentBuyer): string[] {
  const cityLine = [buyer.city, buyer.state, buyer.postalCode].filter(Boolean).join(", ");
  return [buyer.addressLine1, buyer.addressLine2, cityLine, countryName(buyer.country)].filter((line): line is string => Boolean(line));
}

// ── Layout ────────────────────────────────────────────────────────────────

const PAGE = { width: 595.28, height: 841.89, margin: 46 };
const INK = rgb(0.03, 0.09, 0.15);
const MUTED = rgb(0.39, 0.44, 0.49);
const RULE = rgb(0.85, 0.88, 0.89);
const ACCENT = rgb(0.72, 0.43, 0);

class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  get contentWidth() {
    return PAGE.width - PAGE.margin * 2;
  }

  /** Starts a new page unless `height` more points fit on this one. */
  ensure(height: number) {
    if (this.y - height >= PAGE.margin) return;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  wrap(text: string, size: number, width: number, font: PDFFont): string[] {
    if (!isPdfLatinText(text)) throw new WireDocumentTextError(`Text cannot be printed in the document font: ${text.slice(0, 40)}`);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const x = options.x ?? PAGE.margin;
    const lines = this.wrap(text, size, options.width ?? this.contentWidth - (x - PAGE.margin), font);
    const leading = size * 1.4;
    for (const line of lines) {
      this.ensure(leading);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: options.color ?? INK });
      this.y -= leading;
    }
    this.y -= options.gap ?? 0;
  }

  /** Two columns written side by side from the same top; the cursor ends below the taller. */
  columns(left: (x: number, width: number) => void, right: (x: number, width: number) => void, split = 0.5) {
    const top = this.y;
    const gutter = 24;
    const leftWidth = this.contentWidth * split - gutter / 2;
    left(PAGE.margin, leftWidth);
    const leftBottom = this.y;
    this.y = top;
    right(PAGE.margin + leftWidth + gutter, this.contentWidth - leftWidth - gutter);
    this.y = Math.min(leftBottom, this.y);
  }

  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.width - PAGE.margin, y: this.y }, thickness: 0.8, color: RULE });
    this.y -= gap;
  }

  space(height: number) {
    this.y -= height;
  }

  footer(text: string) {
    for (const page of this.doc.getPages()) {
      page.drawText(text, { x: PAGE.margin, y: PAGE.margin / 2, size: 7.5, font: this.regular, color: MUTED });
    }
  }
}

async function newDocument(title: string, input: WireDocumentInput) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(input.seller.name);
  doc.setCreator("LatinTender");
  doc.setProducer("LatinTender");
  doc.setCreationDate(input.order.issuedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, writer: new Writer(doc, regular, bold) };
}

function lineItem(order: WireDocumentOrder): string {
  const cycle = order.interval === "annual" ? `annual, 12 months (12 months for the price of ${ANNUAL_MONTHS_CHARGED})` : "monthly, 1 month";
  return `LatinTender subscription - ${PLAN_NAMES_EN[order.plan]} plan, ${cycle}`;
}

function sellerBlock(writer: Writer, seller: InvoiceSeller, siteOrigin: string, x: number, width: number) {
  writer.text(seller.name, { bold: true, size: 10.5, x, width });
  for (const line of seller.addressLines) writer.text(line, { size: 9, color: MUTED, x, width });
  if (seller.taxId) writer.text(`Tax ID (RFC): ${seller.taxId}`, { size: 9, color: MUTED, x, width });
  writer.text(`${seller.email} · ${siteOrigin.replace(/^https?:\/\//, "")}`, { size: 9, color: MUTED, x, width });
}

function buyerBlock(writer: Writer, buyer: WireDocumentBuyer, x: number, width: number) {
  writer.text(buyer.legalName, { bold: true, size: 10.5, x, width });
  for (const line of buyerAddressLines(buyer)) writer.text(line, { size: 9, color: MUTED, x, width });
  if (buyer.taxId) writer.text(`Tax ID: ${buyer.taxId}`, { size: 9, color: MUTED, x, width });
  writer.text(buyer.billingEmail, { size: 9, color: MUTED, x, width });
}

function label(writer: Writer, text: string, x?: number) {
  writer.text(text.toUpperCase(), { size: 7.5, bold: true, color: ACCENT, x, gap: 2 });
}

// ── Proforma invoice ──────────────────────────────────────────────────────

export async function buildProformaInvoicePdf(input: WireDocumentInput): Promise<Uint8Array> {
  const { seller, buyer, order } = input;
  const { doc, writer } = await newDocument(`Proforma Invoice ${order.reference}`, input);

  writer.columns(
    (x, width) => {
      writer.text("PROFORMA INVOICE", { size: 20, bold: true, x, width, gap: 4 });
      writer.text(`No. ${order.reference}`, { size: 10, bold: true, x, width });
      writer.text(`Issue date: ${formatDate(order.issuedAt)}`, { size: 9, color: MUTED, x, width });
      writer.text("Currency: USD", { size: 9, color: MUTED, x, width });
    },
    (x, width) => {
      label(writer, "Seller", x);
      sellerBlock(writer, seller, input.siteOrigin, x, width);
    },
  );
  writer.rule(14);

  writer.columns(
    (x, width) => {
      label(writer, "Bill to", x);
      buyerBlock(writer, buyer, x, width);
    },
    (x, width) => {
      label(writer, "Service account", x);
      writer.text(order.accountEmail, { size: 9.5, x, width });
      writer.text(`Activated on receipt of payment, for ${TERM_EN[order.interval]}.`, { size: 9, color: MUTED, x, width });
    },
  );
  writer.rule(14);

  // Line item
  const amountWidth = 110;
  const descWidth = writer.contentWidth - amountWidth;
  const headerY = writer.y;
  writer.text("DESCRIPTION", { size: 7.5, bold: true, color: ACCENT, width: descWidth });
  writer.y = headerY;
  writer.text("AMOUNT", { size: 7.5, bold: true, color: ACCENT, x: PAGE.margin + descWidth, width: amountWidth });
  writer.space(4);
  const rowY = writer.y;
  writer.text(lineItem(order), { size: 10, width: descWidth - 16 });
  writer.text(PLAN_SCOPE_EN[order.plan] + ".", { size: 8.5, color: MUTED, width: descWidth - 16 });
  const rowBottom = writer.y;
  writer.y = rowY;
  writer.text(formatUsd(order.amountUsd), { size: 10, x: PAGE.margin + descWidth, width: amountWidth });
  writer.y = Math.min(rowBottom, writer.y);
  writer.rule(8);
  const totalY = writer.y;
  writer.text("Total due", { size: 11, bold: true, width: descWidth });
  writer.y = totalY;
  writer.text(formatUsd(order.amountUsd), { size: 11, bold: true, x: PAGE.margin + descWidth, width: amountWidth });
  writer.text("Prices include any applicable taxes.", { size: 8.5, color: MUTED });
  writer.rule(14);

  label(writer, "Payment");
  writer.text("Terms: 100% in advance by international wire transfer (SWIFT), in US dollars.", { size: 9.5 });
  writer.text(`Payment reference: ${order.reference} - must appear in the payment details of the transfer.`, { size: 9.5, bold: true });
  writer.text("Bank charges: all charges of the sending and intermediary banks are for the payer (OUR). Access is activated when the full amount is received.", { size: 9.5 });
  writer.text(`Beneficiary: ${endSentence(seller.name)}`, { size: 9.5 });
  writer.text(
    `Bank details are sent by our billing team from ${seller.email} after the order has been verified; they are not shown on the website or in this document. Do not pay any account whose beneficiary is not ${seller.name}, and if you receive instructions you did not expect, confirm them with us before paying.`,
    { size: 9.5, gap: 6 },
  );
  label(writer, "Notes");
  writer.text("This is a proforma invoice issued to request payment. It is not a tax invoice. The tax invoice (CFDI) is issued by the seller after payment has been received.", { size: 8.5, color: MUTED });
  writer.text(`The service is governed by the Subscription Service Agreement No. ${order.reference}, the Terms of Service (${input.siteOrigin}/terms) and the Refund Policy (${input.siteOrigin}/refund-policy).`, { size: 8.5, color: MUTED });

  writer.footer(`${seller.name} · Proforma Invoice ${order.reference}`);
  return doc.save();
}

// ── Service agreement ─────────────────────────────────────────────────────

export async function buildServiceAgreementPdf(input: WireDocumentInput): Promise<Uint8Array> {
  const { seller, buyer, order } = input;
  const { doc, writer } = await newDocument(`Subscription Service Agreement ${order.reference}`, input);

  writer.text("SUBSCRIPTION SERVICE AGREEMENT", { size: 18, bold: true, gap: 2 });
  writer.text(`No. ${order.reference} · ${formatDate(order.issuedAt)}`, { size: 9.5, color: MUTED });
  writer.rule(12);

  writer.columns(
    (x, width) => {
      label(writer, "Provider", x);
      sellerBlock(writer, seller, input.siteOrigin, x, width);
    },
    (x, width) => {
      label(writer, "Customer", x);
      buyerBlock(writer, buyer, x, width);
    },
  );
  writer.rule(12);

  const clauses: [string, string][] = [
    ["1. Service", `The Provider gives the Customer access to the LatinTender online tender intelligence platform (${input.siteOrigin}) under the ${PLAN_NAMES_EN[order.plan]} plan: ${PLAN_SCOPE_EN[order.plan]}, as described on ${input.siteOrigin}/pricing on the date of this Agreement. The subscription is activated on the account registered to ${order.accountEmail}.`],
    ["2. Term", `${TERM_EN[order.interval][0].toUpperCase()}${TERM_EN[order.interval].slice(1)}, starting on the day the Provider confirms receipt of the full fee and activates the account. The subscription does not renew automatically; a renewal is a new order.`],
    ["3. Fee", `${formatUsd(order.amountUsd)}${order.interval === "annual" ? ` for 12 months (12 months for the price of ${ANNUAL_MONTHS_CHARGED})` : " for 1 month"}, including any applicable taxes, payable in full in advance by international wire transfer in US dollars, quoting reference ${order.reference}. Bank charges of the sending and intermediary banks are for the Customer (OUR).`],
    ["4. Payment details", `The Provider sends its bank details by email from ${seller.email} after verifying this order; they are not published on the website. The beneficiary is always ${endSentence(seller.name)} The Customer should not pay any other beneficiary and should confirm unexpected instructions with the Provider before paying.`],
    ["5. Invoice", "After receiving payment, the Provider issues its tax invoice (CFDI) for the fee. The proforma invoice with the same number is a request for payment, not a tax invoice."],
    ["6. Use", "The subscription is for the Customer's own business use by the number of named users in the plan. Accounts may not be shared, resold or used to copy restricted content in bulk. Tender information comes from public sources and summaries and translations are aids; bid decisions should be checked against the official documents."],
    ["7. Refunds", `Refunds follow the Refund Policy at ${input.siteOrigin}/refund-policy.`],
    ["8. Terms and law", `The Terms of Service at ${input.siteOrigin}/terms apply to the service and form part of this Agreement; where they differ on the fee or the term, this Agreement prevails. The Agreement is governed by the law stated in the Terms of Service.`],
    ["9. Acceptance", `This Agreement takes effect when the Customer pays the fee for order ${order.reference}. Signatures are optional; if the Customer requires a countersigned copy, it may sign and send this document to ${seller.email}.`],
  ];
  for (const [heading, body] of clauses) {
    writer.text(heading, { size: 9.5, bold: true, gap: 1 });
    writer.text(body, { size: 9, gap: 4 });
  }

  // The two signature blocks stay together on one page.
  writer.space(10);
  writer.ensure(90);
  writer.columns(
    (x, width) => {
      writer.text("For the Provider", { size: 9, bold: true, x, width, gap: 26 });
      writer.page.drawLine({ start: { x, y: writer.y }, end: { x: x + width - 20, y: writer.y }, thickness: 0.6, color: INK });
      writer.space(4);
      writer.text(seller.name, { size: 8.5, color: MUTED, x, width });
      writer.text("Name, title, date", { size: 8.5, color: MUTED, x, width });
    },
    (x, width) => {
      writer.text("For the Customer", { size: 9, bold: true, x, width, gap: 26 });
      writer.page.drawLine({ start: { x, y: writer.y }, end: { x: x + width - 20, y: writer.y }, thickness: 0.6, color: INK });
      writer.space(4);
      writer.text(buyer.legalName, { size: 8.5, color: MUTED, x, width });
      writer.text("Name, title, date, company seal", { size: 8.5, color: MUTED, x, width });
    },
  );

  writer.footer(`${seller.name} · Subscription Service Agreement ${order.reference}`);
  return doc.save();
}
