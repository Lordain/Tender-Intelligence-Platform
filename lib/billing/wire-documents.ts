/**
 * The two documents a company's finance team needs to pay a subscription by
 * international wire: a proforma invoice and a short service agreement, each
 * in English with Chinese beneath (user, 2026-09-28: 客户选择电汇后，自动生成
 * 英文形式发票和简版服务协议 PDF，客户可以直接交给财务; then: 可以是中英文吗？).
 * The English text prevails, and both documents say so.
 *
 * Built on demand from the wire request and the buyer's billing profile, so
 * nothing is stored. Neither document carries bank details: since 2026-09-09
 * (8d33ee2) the receiving account is only ever sent by staff, by email, after
 * they have checked the order, and the documents say so — together with the
 * one fact a payer can check, that the beneficiary must be the seller named
 * here.
 *
 * Printed in Noto Sans SC (lib/billing/fonts), subset to GB2312 plus Latin-1,
 * so a Chinese company name prints as typed. A character outside that set is
 * refused (unprintableCharacters) rather than drawn as an empty box.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import subsetFont from "subset-font";
import { ANNUAL_MONTHS_CHARGED, PLAN_NAMES, type PaidInterval, type PaidPlan } from "@/lib/billing-catalog";
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

export class WireDocumentTextError extends Error {}

// ── Fonts ─────────────────────────────────────────────────────────────────

const FONT_DIR = path.join(process.cwd(), "lib", "billing", "fonts");
let fontBytes: { regular: Uint8Array; bold: Uint8Array } | null = null;
let coverage: { hasGlyphForCodePoint(codePoint: number): boolean } | null = null;

function fonts() {
  fontBytes ??= {
    regular: readFileSync(path.join(FONT_DIR, "NotoSansSC-Regular-GB2312.ttf")),
    bold: readFileSync(path.join(FONT_DIR, "NotoSansSC-Bold-GB2312.ttf")),
  };
  return fontBytes;
}

/**
 * The characters of `text` the document font cannot draw, deduplicated —
 * empty when all of it prints. Used by the wire route to refuse a name before
 * the request is saved, and by the builder as a last check.
 */
export function unprintableCharacters(text: string | null | undefined): string[] {
  coverage ??= fontkit.create(Buffer.from(fonts().regular)) as unknown as { hasGlyphForCodePoint(codePoint: number): boolean };
  const missing = new Set<string>();
  for (const char of text ?? "") {
    const codePoint = char.codePointAt(0)!;
    if (codePoint < 0x20) continue;
    if (!coverage.hasGlyphForCodePoint(codePoint)) missing.add(char);
  }
  return [...missing];
}

// ── Wording ───────────────────────────────────────────────────────────────

export const PLAN_NAMES_EN: Record<PaidPlan, string> = {
  basic: "Basic Individual",
  professional: "Professional Individual",
  enterprise: "Professional Enterprise",
};

const PLAN_SCOPE: Record<PaidPlan, { en: string; zh: string }> = {
  basic: {
    en: "1 user account; full tender details and document analysis for two selected countries",
    zh: "1 个用户账号；可查看所选 2 个国家的全部项目详情和标书分析",
  },
  professional: {
    en: "1 user account; full tender details and document analysis for all covered countries",
    zh: "1 个用户账号；可查看全部覆盖国家的项目详情和标书分析",
  },
  enterprise: {
    en: "3 user accounts; full tender details and document analysis for all covered countries; monthly industry report",
    zh: "3 个用户账号；可查看全部覆盖国家的项目详情和标书分析；每月行业分析报告",
  },
};

const TERM: Record<PaidInterval, { en: string; zh: string }> = {
  monthly: { en: "1 month", zh: "1 个月" },
  annual: { en: "12 months", zh: "12 个月" },
};

export function formatUsd(amount: number): string {
  return `USD ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): { en: string; zh: string } {
  return {
    en: date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    zh: `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`,
  };
}

/** "S.A. de C.V." already ends a sentence; anything else gets its full stop. */
function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function countryName(code: string): string {
  const name = (locale: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
  const en = name("en");
  const zh = name("zh-CN");
  return en === zh ? en : `${en} ${zh}`;
}

export function buyerAddressLines(buyer: WireDocumentBuyer): string[] {
  const cityLine = [buyer.city, buyer.state, buyer.postalCode].filter(Boolean).join(", ");
  return [buyer.addressLine1, buyer.addressLine2, cityLine, countryName(buyer.country)].filter((line): line is string => Boolean(line));
}

// ── Layout ────────────────────────────────────────────────────────────────

const PAGE = { width: 595.28, height: 841.89, margin: 46 };
const INK = rgb(0.03, 0.09, 0.15);
const MUTED = rgb(0.39, 0.44, 0.49);
const ZH = rgb(0.2, 0.26, 0.31);
const RULE = rgb(0.85, 0.88, 0.89);
const ACCENT = rgb(0.72, 0.43, 0);

/** One CJK character, one run of other non-space characters, or one run of spaces. */
const TOKENS = /[⺀-鿿豈-﫿︰-﹏＀-￯]|[^\s⺀-鿿豈-﫿︰-﹏＀-￯]+|\s+/g;

class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont, private used?: Set<string>) {
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

  /** Wraps between words, and between any two Chinese characters. */
  wrap(text: string, size: number, width: number, font: PDFFont): string[] {
    const missing = unprintableCharacters(text);
    if (missing.length > 0) throw new WireDocumentTextError(`Cannot print ${missing.join("")} in: ${text.slice(0, 40)}`);
    const measure = (value: string) => font.widthOfTextAtSize(value, size);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const token of paragraph.match(TOKENS) ?? []) {
        if (measure(line + token) <= width) {
          line += token;
          continue;
        }
        if (line.trim()) lines.push(line.trimEnd());
        line = /^\s+$/.test(token) ? "" : token;
        // A token wider than the line (a long URL) is cut by character.
        while (measure(line) > width) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut)) > width) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }

  text(text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const x = options.x ?? PAGE.margin;
    for (const char of text) this.used?.add(char);
    const lines = this.wrap(text, size, options.width ?? this.contentWidth - (x - PAGE.margin), font);
    const leading = size * 1.45;
    for (const line of lines) {
      this.ensure(leading);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: options.color ?? INK });
      this.y -= leading;
    }
    this.y -= options.gap ?? 0;
  }

  /** English, then the Chinese a little smaller beneath it. */
  both(en: string, zh: string, options: { size?: number; bold?: boolean; x?: number; width?: number; gap?: number } = {}) {
    const size = options.size ?? 9;
    this.text(en, { ...options, size, gap: 1 });
    this.text(zh, { ...options, size: size - 0.5, color: options.bold ? INK : ZH, gap: options.gap ?? 0 });
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
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      const line = pages.length > 1 ? `${text} · ${index + 1}/${pages.length}` : text;
      for (const char of line) this.used?.add(char);
      page.drawText(line, { x: PAGE.margin, y: PAGE.margin / 2, size: 7, font: this.regular, color: MUTED });
    });
  }
}

type FontPair = { regular: Uint8Array; bold: Uint8Array };

async function layout(title: string, input: WireDocumentInput, fontPair: FontPair, draw: (writer: Writer) => void, used?: Set<string>) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setAuthor(input.seller.name);
  doc.setCreator("LatinTender");
  doc.setProducer("LatinTender");
  doc.setCreationDate(input.order.issuedAt);
  // pdf-lib's own subsetting (subset: true) drops glyphs from this font —
  // most Latin letters vanished in the first test — so fonts go in whole and
  // are cut down beforehand, below.
  const regular = await doc.embedFont(fontPair.regular, { subset: false });
  const bold = await doc.embedFont(fontPair.bold, { subset: false });
  draw(new Writer(doc, regular, bold, used));
  return doc;
}

/**
 * Two passes: lay the document out with the whole font to learn which
 * characters it draws, then again with a font cut down to exactly those
 * (HarfBuzz, via subset-font). The glyphs and their widths are the same, so
 * the second layout matches the first, and the PDF is tens of kilobytes
 * instead of the 2.9 MB the whole GB2312 font would add.
 */
async function build(title: string, input: WireDocumentInput, draw: (writer: Writer) => void): Promise<Uint8Array> {
  const used = new Set<string>();
  await layout(title, input, fonts(), draw, used);
  const chars = [...used].join("");
  const [regular, bold] = await Promise.all([
    subsetFont(Buffer.from(fonts().regular), chars, { targetFormat: "truetype" }),
    subsetFont(Buffer.from(fonts().bold), chars, { targetFormat: "truetype" }),
  ]);
  return (await layout(title, input, { regular, bold }, draw)).save();
}

function label(writer: Writer, en: string, zh: string, x?: number) {
  writer.text(`${en.toUpperCase()}  ${zh}`, { size: 7.5, bold: true, color: ACCENT, x, gap: 2 });
}

function sellerBlock(writer: Writer, seller: InvoiceSeller, siteOrigin: string, x: number, width: number) {
  writer.text(seller.name, { bold: true, size: 10, x, width });
  for (const line of seller.addressLines) writer.text(line, { size: 8.5, color: MUTED, x, width });
  if (seller.taxId) writer.text(`Tax ID (RFC) 税号: ${seller.taxId}`, { size: 8.5, color: MUTED, x, width });
  writer.text(`${seller.email} · ${siteOrigin.replace(/^https?:\/\//, "")}`, { size: 8.5, color: MUTED, x, width });
}

function buyerBlock(writer: Writer, buyer: WireDocumentBuyer, x: number, width: number) {
  writer.text(buyer.legalName, { bold: true, size: 10, x, width });
  for (const line of buyerAddressLines(buyer)) writer.text(line, { size: 8.5, color: MUTED, x, width });
  if (buyer.taxId) writer.text(`Tax ID 税号: ${buyer.taxId}`, { size: 8.5, color: MUTED, x, width });
  writer.text(buyer.billingEmail, { size: 8.5, color: MUTED, x, width });
}

function lineItem(order: WireDocumentOrder): { en: string; zh: string } {
  return order.interval === "annual"
    ? {
        en: `LatinTender subscription - ${PLAN_NAMES_EN[order.plan]} plan, annual: 12 months for the price of ${ANNUAL_MONTHS_CHARGED}`,
        zh: `LatinTender 订阅服务 - ${PLAN_NAMES[order.plan]}，年付：12 个月按 ${ANNUAL_MONTHS_CHARGED} 个月收费`,
      }
    : {
        en: `LatinTender subscription - ${PLAN_NAMES_EN[order.plan]} plan, monthly: 1 month`,
        zh: `LatinTender 订阅服务 - ${PLAN_NAMES[order.plan]}，按月：1 个月`,
      };
}

const PREVAILS = { en: "This document is in English and Chinese; if they differ, the English text prevails.", zh: "本文件以英文和中文书就，如有不一致，以英文为准。" };

// ── Proforma invoice ──────────────────────────────────────────────────────

export function buildProformaInvoicePdf(input: WireDocumentInput): Promise<Uint8Array> {
  return build(`Proforma Invoice ${input.order.reference}`, input, (writer) => drawProformaInvoice(writer, input));
}

function drawProformaInvoice(writer: Writer, input: WireDocumentInput) {
  const { seller, buyer, order } = input;
  const issued = formatDate(order.issuedAt);

  writer.columns(
    (x, width) => {
      writer.text("PROFORMA INVOICE", { size: 19, bold: true, x, width });
      writer.text("形式发票", { size: 13, bold: true, x, width, gap: 4 });
      writer.text(`No. 编号: ${order.reference}`, { size: 9.5, bold: true, x, width });
      writer.text(`Issue date 开具日期: ${issued.en} / ${issued.zh}`, { size: 8.5, color: MUTED, x, width });
      writer.text("Currency 币种: USD 美元", { size: 8.5, color: MUTED, x, width });
    },
    (x, width) => {
      label(writer, "Seller", "卖方", x);
      sellerBlock(writer, seller, input.siteOrigin, x, width);
    },
  );
  writer.rule(12);

  writer.columns(
    (x, width) => {
      label(writer, "Bill to", "买方", x);
      buyerBlock(writer, buyer, x, width);
    },
    (x, width) => {
      label(writer, "Service account", "服务账户", x);
      writer.text(order.accountEmail, { size: 9, x, width });
      writer.both(`Activated on receipt of payment, for ${TERM[order.interval].en}.`, `全额到账后开通，服务期 ${TERM[order.interval].zh}。`, { size: 8.5, x, width });
    },
  );
  writer.rule(12);

  const amountWidth = 110;
  const descWidth = writer.contentWidth - amountWidth;
  const headerY = writer.y;
  writer.text("DESCRIPTION  项目", { size: 7.5, bold: true, color: ACCENT, width: descWidth });
  writer.y = headerY;
  writer.text("AMOUNT  金额", { size: 7.5, bold: true, color: ACCENT, x: PAGE.margin + descWidth, width: amountWidth });
  writer.space(3);
  const rowY = writer.y;
  const item = lineItem(order);
  writer.both(item.en, item.zh, { size: 9.5, width: descWidth - 16, gap: 2 });
  writer.both(`${PLAN_SCOPE[order.plan].en}.`, `${PLAN_SCOPE[order.plan].zh}。`, { size: 8, width: descWidth - 16 });
  const rowBottom = writer.y;
  writer.y = rowY;
  writer.text(formatUsd(order.amountUsd), { size: 10, x: PAGE.margin + descWidth, width: amountWidth });
  writer.y = Math.min(rowBottom, writer.y);
  writer.rule(8);
  const totalY = writer.y;
  writer.text("Total due  应付总额", { size: 11, bold: true, width: descWidth });
  writer.y = totalY;
  writer.text(formatUsd(order.amountUsd), { size: 11, bold: true, x: PAGE.margin + descWidth, width: amountWidth });
  writer.both("Prices include any applicable taxes.", "价格已含依法适用的税费。", { size: 8 });
  writer.rule(12);

  label(writer, "Payment", "付款");
  const payment: [string, string, boolean?][] = [
    ["Terms: 100% in advance by international wire transfer (SWIFT), in US dollars.", "付款条件：通过国际电汇（SWIFT）以美元一次性预付全款。"],
    [`Payment reference: ${order.reference} - must appear in the payment details of the transfer.`, `付款附言：${order.reference}，须填写在汇款附言中。`, true],
    ["Bank charges: all charges of the sending and intermediary banks are for the payer (OUR). Access is activated when the full amount is received.", "手续费：汇出行及中转行费用均由付款方承担（OUR）。全额到账后开通服务。"],
    [`Beneficiary: ${endSentence(seller.name)}`, `收款人：${seller.name}`],
    [
      `Bank details are sent by our billing team from ${seller.email} after the order has been verified; they are not shown on the website or in this document. Do not pay any account whose beneficiary is not ${endSentence(seller.name)} If you receive instructions you did not expect, confirm them with us before paying.`,
      `收款银行信息由我方账单团队核对订单后，从 ${seller.email} 以邮件发送，不在网站或本文件中显示。收款人不是 ${seller.name} 的账户请勿付款；如收到非预期的付款指示，请先与我们确认。`,
    ],
  ];
  for (const [en, zh, bold] of payment) writer.both(en, zh, { size: 8.8, bold, gap: 4 });

  writer.space(2);
  label(writer, "Notes", "说明");
  writer.both(
    "This is a proforma invoice issued to request payment. It is not a tax invoice. The tax invoice (CFDI) is issued by the seller after payment has been received.",
    "本形式发票用于请款，不是税务发票。卖方在收到付款后开具正式税务发票（CFDI）。",
    { size: 8, gap: 3 },
  );
  writer.both(
    `The service is governed by the Subscription Service Agreement No. ${order.reference}, the Terms of Service (${input.siteOrigin}/terms) and the Refund Policy (${input.siteOrigin}/refund-policy).`,
    `本服务受编号 ${order.reference} 的《订阅服务协议》、服务条款（${input.siteOrigin}/terms）及退款政策（${input.siteOrigin}/refund-policy）约束。`,
    { size: 8, gap: 3 },
  );
  writer.both(PREVAILS.en, PREVAILS.zh, { size: 8 });

  writer.footer(`${seller.name} · Proforma Invoice 形式发票 ${order.reference}`);
}

// ── Service agreement ─────────────────────────────────────────────────────

export function buildServiceAgreementPdf(input: WireDocumentInput): Promise<Uint8Array> {
  return build(`Subscription Service Agreement ${input.order.reference}`, input, (writer) => drawServiceAgreement(writer, input));
}

function drawServiceAgreement(writer: Writer, input: WireDocumentInput) {
  const { seller, buyer, order } = input;
  const issued = formatDate(order.issuedAt);
  const term = TERM[order.interval];
  const scope = PLAN_SCOPE[order.plan];
  const site = input.siteOrigin;

  writer.text("SUBSCRIPTION SERVICE AGREEMENT", { size: 17, bold: true });
  writer.text("订阅服务协议", { size: 13, bold: true, gap: 3 });
  writer.text(`No. 编号: ${order.reference} · ${issued.en} / ${issued.zh}`, { size: 9, color: MUTED });
  writer.rule(10);

  writer.columns(
    (x, width) => {
      label(writer, "Provider", "服务提供方", x);
      sellerBlock(writer, seller, site, x, width);
    },
    (x, width) => {
      label(writer, "Customer", "客户", x);
      buyerBlock(writer, buyer, x, width);
    },
  );
  writer.rule(10);

  const fee = order.interval === "annual"
    ? { en: ` for 12 months (12 months for the price of ${ANNUAL_MONTHS_CHARGED})`, zh: `，服务期 12 个月（按 ${ANNUAL_MONTHS_CHARGED} 个月收费）` }
    : { en: " for 1 month", zh: "，服务期 1 个月" };
  const clauses: { heading: string; en: string; zh: string }[] = [
    {
      heading: "1. Service 服务内容",
      en: `The Provider gives the Customer access to the LatinTender online tender intelligence platform (${site}) under the ${PLAN_NAMES_EN[order.plan]} plan: ${scope.en}, as described on ${site}/pricing on the date of this Agreement. The subscription is activated on the account registered to ${order.accountEmail}.`,
      zh: `服务提供方向客户提供 LatinTender 在线招投标信息平台（${site}）${PLAN_NAMES[order.plan]}的使用权限：${scope.zh}，以本协议日期 ${site}/pricing 页面的说明为准。订阅开通在注册邮箱为 ${order.accountEmail} 的账户上。`,
    },
    {
      heading: "2. Term 服务期限",
      en: `${term.en[0].toUpperCase()}${term.en.slice(1)}, starting on the day the Provider confirms receipt of the full fee and activates the account. The subscription does not renew automatically; a renewal is a new order.`,
      zh: `${term.zh}，自服务提供方确认收到全部费用并开通账户之日起计算。订阅不会自动续期；续期需另行下单。`,
    },
    {
      heading: "3. Fee 费用",
      en: `${formatUsd(order.amountUsd)}${fee.en}, including any applicable taxes, payable in full in advance by international wire transfer in US dollars, quoting reference ${order.reference}. Bank charges of the sending and intermediary banks are for the Customer (OUR).`,
      zh: `${formatUsd(order.amountUsd)}${fee.zh}，含依法适用的税费，须以美元通过国际电汇一次性预付全款，并在附言中注明 ${order.reference}。汇出行及中转行费用由客户承担（OUR）。`,
    },
    {
      heading: "4. Payment details 收款信息",
      en: `The Provider sends its bank details by email from ${seller.email} after verifying this order; they are not published on the website. The beneficiary is always ${endSentence(seller.name)} The Customer should not pay any other beneficiary and should confirm unexpected instructions with the Provider before paying.`,
      zh: `服务提供方在核对订单后，从 ${seller.email} 以邮件发送收款银行信息，不在网站上公布。收款人始终为 ${seller.name}。客户不应向其他收款人付款；如收到非预期的付款指示，应先与服务提供方确认。`,
    },
    {
      heading: "5. Invoice 发票",
      en: "After receiving payment, the Provider issues its tax invoice (CFDI) for the fee. The proforma invoice with the same number is a request for payment, not a tax invoice.",
      zh: "收到付款后，服务提供方就该费用开具正式税务发票（CFDI）。同编号的形式发票仅用于请款，不是税务发票。",
    },
    {
      heading: "6. Use 使用",
      en: "The subscription is for the Customer's own business use by the number of named users in the plan. Accounts may not be shared, resold or used to copy restricted content in bulk. Tender information comes from public sources and summaries and translations are aids; bid decisions should be checked against the official documents.",
      zh: "订阅仅供客户在方案规定的用户数内用于自身业务，不得共享、转售账户或批量复制受限内容。招标信息来自公开来源，摘要和翻译仅供参考，投标决策应以官方文件为准。",
    },
    {
      heading: "7. Refunds 退款",
      en: `Refunds follow the Refund Policy at ${site}/refund-policy.`,
      zh: `退款按 ${site}/refund-policy 的退款政策处理。`,
    },
    {
      heading: "8. Terms and law 条款与法律适用",
      en: `The Terms of Service at ${site}/terms apply to the service and form part of this Agreement; where they differ on the fee or the term, this Agreement prevails. The Agreement is governed by the law stated in the Terms of Service. ${PREVAILS.en}`,
      zh: `${site}/terms 的服务条款适用于本服务并构成本协议的一部分；在费用或期限方面与本协议不一致的，以本协议为准。本协议适用服务条款中载明的法律。${PREVAILS.zh}`,
    },
    {
      heading: "9. Acceptance 生效",
      en: `This Agreement takes effect when the Customer pays the fee for order ${order.reference}. Signatures are optional; if the Customer requires a countersigned copy, it may sign and send this document to ${seller.email}.`,
      zh: `客户支付订单 ${order.reference} 的费用后，本协议生效。签字并非必需；如客户需要双方签署的版本，可签字盖章后发送至 ${seller.email}。`,
    },
  ];
  for (const clause of clauses) {
    writer.ensure(70);
    writer.text(clause.heading, { size: 9.5, bold: true, gap: 1 });
    writer.both(clause.en, clause.zh, { size: 8.8, gap: 5 });
  }

  // The two signature blocks stay together on one page.
  writer.space(8);
  writer.ensure(90);
  const signature = (heading: string, name: string, fields: string) => (x: number, width: number) => {
    writer.text(heading, { size: 9, bold: true, x, width, gap: 26 });
    writer.page.drawLine({ start: { x, y: writer.y }, end: { x: x + width - 20, y: writer.y }, thickness: 0.6, color: INK });
    writer.space(4);
    writer.text(name, { size: 8.5, color: MUTED, x, width });
    writer.text(fields, { size: 8, color: MUTED, x, width });
  };
  writer.columns(
    signature("For the Provider 服务提供方", seller.name, "Name, title, date 姓名、职务、日期"),
    signature("For the Customer 客户", buyer.legalName, "Name, title, date, company seal 姓名、职务、日期、公司盖章"),
  );

  writer.footer(`${seller.name} · Subscription Service Agreement 订阅服务协议 ${order.reference}`);
}
