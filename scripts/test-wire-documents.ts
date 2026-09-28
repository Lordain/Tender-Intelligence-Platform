/**
 * Checks the international-wire proforma invoice and service agreement
 * (lib/billing/wire-documents.ts): what they say, that they fit, and that they
 * never carry bank details. No network, no database.
 *
 *   npm run test:wire-documents
 */
import { extractText, getDocumentProxy } from "unpdf";
import { PLAN_PRICES_USD, type PaidInterval, type PaidPlan } from "../lib/billing-catalog";
import { isPdfLatinText } from "../lib/billing/pdf-text";
import {
  buildProformaInvoicePdf,
  buildServiceAgreementPdf,
  WireDocumentTextError,
  type WireDocumentInput,
} from "../lib/billing/wire-documents";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
  }
}

function input(plan: PaidPlan, interval: PaidInterval): WireDocumentInput {
  return {
    seller: { name: "Example Servicios Digitales S.A. de C.V.", addressLines: ["Av. Paseo de la Reforma 222, Piso 10", "Col. Juárez, 06600 Ciudad de México, Mexico"], taxId: "ESD240101AB1", email: "billing@latintender.com" },
    buyer: { legalName: "China Example Power Engineering Co., Ltd.", addressLine1: "No. 18 Example Road, Chaoyang District", addressLine2: null, city: "Beijing", state: null, postalCode: "100020", country: "CN", taxId: "91110000MA01EXAMPLE", billingEmail: "finance@example.cn" },
    order: { reference: "LTW-20260928-3F9A2C1B", plan, interval, amountUsd: PLAN_PRICES_USD[plan][interval], issuedAt: new Date("2026-09-28T15:00:00Z"), accountEmail: "li.wei@example.cn" },
    siteOrigin: "https://latintender.com",
  };
}

async function read(pdf: Uint8Array) {
  const doc = await getDocumentProxy(pdf);
  const { text } = await extractText(doc, { mergePages: true });
  return { pages: doc.numPages, text: text.replace(/\s+/g, " ") };
}

async function main() {
  check("Latin-1 Spanish is printable", isPdfLatinText("Col. Juárez, Cuauhtémoc — Ciudad de México"), true);
  check("Chinese is not printable", isPdfLatinText("中国电建"), false);
  check("empty is printable", isPdfLatinText(""), true);

  const invoice = await read(await buildProformaInvoicePdf(input("professional", "annual")));
  check("invoice: one page", invoice.pages, 1);
  check("invoice: title", invoice.text.includes("PROFORMA INVOICE"), true);
  check("invoice: reference", invoice.text.includes("LTW-20260928-3F9A2C1B"), true);
  check("invoice: annual amount", invoice.text.includes("USD 1,990.00"), true);
  check("invoice: 12 months for 10", invoice.text.includes("12 months for the price of 10"), true);
  check("invoice: buyer", invoice.text.includes("China Example Power Engineering Co., Ltd."), true);
  check("invoice: buyer country spelled out", invoice.text.includes("China"), true);
  check("invoice: seller with RFC", invoice.text.includes("Tax ID (RFC): ESD240101AB1"), true);
  check("invoice: beneficiary named once, no double full stop", /Beneficiary: Example Servicios Digitales S\.A\. de C\.V\.(?!\.)/.test(invoice.text), true);
  check("invoice: OUR charges", invoice.text.includes("(OUR)"), true);
  check("invoice: says it is not a tax invoice", invoice.text.includes("It is not a tax invoice"), true);
  // The 2026-09-09 rule: bank details only ever come from staff by email.
  check("invoice: no bank fields", /SWIFT\/BIC|IBAN|Account number|CLABE|Routing/i.test(invoice.text), false);

  const agreement = await read(await buildServiceAgreementPdf(input("professional", "annual")));
  check("agreement: one page", agreement.pages, 1);
  check("agreement: 12-month term, no auto-renewal", agreement.text.includes("12 months, starting on the day") && agreement.text.includes("does not renew automatically"), true);
  check("agreement: plan scope", agreement.text.includes("Professional Individual plan"), true);
  check("agreement: account email", agreement.text.includes("li.wei@example.cn"), true);
  check("agreement: terms and refund links", agreement.text.includes("https://latintender.com/terms") && agreement.text.includes("https://latintender.com/refund-policy"), true);
  check("agreement: no bank fields", /IBAN|Account number|CLABE|Routing/i.test(agreement.text), false);

  for (const plan of ["basic", "professional", "enterprise"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const [a, b] = await Promise.all([buildProformaInvoicePdf(input(plan, interval)), buildServiceAgreementPdf(input(plan, interval))]);
      const [ra, rb] = await Promise.all([read(a), read(b)]);
      check(`${plan}/${interval}: invoice amount`, ra.text.includes(`USD ${PLAN_PRICES_USD[plan][interval].toLocaleString("en-US")}.00`), true);
      check(`${plan}/${interval}: agreement ≤ 2 pages`, rb.pages <= 2, true);
    }
  }
  const monthly = await read(await buildServiceAgreementPdf(input("basic", "monthly")));
  check("monthly agreement: 1-month term", monthly.text.includes("1 month, starting on the day"), true);
  const enterprise = await read(await buildProformaInvoicePdf(input("enterprise", "annual")));
  check("enterprise: 3 user accounts", enterprise.text.includes("3 user accounts"), true);

  const chinese = input("basic", "monthly");
  chinese.buyer.legalName = "中国示例电力工程有限公司";
  let threw: unknown = null;
  try {
    await buildProformaInvoicePdf(chinese);
  } catch (err) {
    threw = err;
  }
  check("a Chinese company name is refused, not garbled", threw instanceof WireDocumentTextError, true);

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
