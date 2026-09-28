/**
 * Checks the international-wire proforma invoice and service agreement
 * (lib/billing/wire-documents.ts): what they say in both languages, that they
 * fit, and that they never carry bank details. No network, no database.
 *
 *   npm run test:wire-documents
 */
import { extractText, getDocumentProxy } from "unpdf";
import { PLAN_PRICES_USD, type PaidInterval, type PaidPlan } from "../lib/billing-catalog";
import {
  buildProformaInvoicePdf,
  buildServiceAgreementPdf,
  unprintableCharacters,
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
  check("Latin-1 Spanish is printable", unprintableCharacters("Col. Juárez, Cuauhtémoc — Ciudad de México"), []);
  check("a Chinese company name is printable", unprintableCharacters("中国电力建设集团有限公司（北京）"), []);
  check("a character outside GB2312 is named", unprintableCharacters("龑科技有限公司"), ["龑"]);
  check("empty is printable", unprintableCharacters(""), []);

  const invoice = await read(await buildProformaInvoicePdf(input("professional", "annual")));
  check("invoice: one page", invoice.pages, 1);
  check("invoice: title in both languages", invoice.text.includes("PROFORMA INVOICE") && invoice.text.includes("形式发票"), true);
  check("invoice: English prevails", invoice.text.includes("the English text prevails") && invoice.text.includes("以英文为准"), true);
  check("invoice: reference", invoice.text.includes("LTW-20260928-3F9A2C1B"), true);
  check("invoice: annual amount", invoice.text.includes("USD 1,990.00"), true);
  check("invoice: 12 months for 10", invoice.text.includes("12 months for the price of 10"), true);
  check("invoice: buyer", invoice.text.includes("China Example Power Engineering Co., Ltd."), true);
  check("invoice: buyer country spelled out in both", invoice.text.includes("China 中国"), true);
  check("invoice: seller with RFC", invoice.text.includes("ESD240101AB1"), true);
  check("invoice: beneficiary named once, no double full stop", /Beneficiary: Example Servicios Digitales S\.A\. de C\.V\.(?!\.)/.test(invoice.text), true);
  check("invoice: OUR charges", invoice.text.includes("(OUR)"), true);
  check("invoice: says it is not a tax invoice", invoice.text.includes("It is not a tax invoice"), true);
  // The 2026-09-09 rule: bank details only ever come from staff by email.
  check("invoice: no bank fields", /SWIFT\/BIC|IBAN|Account number|CLABE|Routing/i.test(invoice.text), false);

  const agreement = await read(await buildServiceAgreementPdf(input("professional", "annual")));
  check("agreement: two pages at most", agreement.pages <= 2, true);
  check("agreement: Chinese clauses", agreement.text.includes("订阅服务协议") && agreement.text.includes("订阅不会自动续期"), true);
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
      check(`${plan}/${interval}: invoice one page`, ra.pages, 1);
      check(`${plan}/${interval}: agreement ≤ 2 pages`, rb.pages <= 2, true);
    }
  }
  const monthly = await read(await buildServiceAgreementPdf(input("basic", "monthly")));
  check("monthly agreement: 1-month term", monthly.text.includes("1 month, starting on the day"), true);
  const enterprise = await read(await buildProformaInvoicePdf(input("enterprise", "annual")));
  check("enterprise: 3 user accounts", enterprise.text.includes("3 user accounts"), true);

  const chinese = input("basic", "monthly");
  chinese.buyer.legalName = "中国示例电力工程有限公司";
  chinese.buyer.addressLine1 = "北京市朝阳区示例路18号";
  const chineseInvoice = await read(await buildProformaInvoicePdf(chinese));
  check("a Chinese company name prints as typed", chineseInvoice.text.includes("中国示例电力工程有限公司") && chineseInvoice.text.includes("北京市朝阳区示例路18号"), true);

  const rare = input("basic", "monthly");
  rare.buyer.legalName = "龑科技有限公司";
  let threw: unknown = null;
  try {
    await buildProformaInvoicePdf(rare);
  } catch (err) {
    threw = err;
  }
  check("a character the font lacks is refused, not drawn as a box", threw instanceof WireDocumentTextError, true);

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
