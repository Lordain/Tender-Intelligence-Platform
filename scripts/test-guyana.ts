/**
 * Guyana (eprocure.gov.gy, staged 2026-09-27): parsing, the large-projects-only
 * rule, the stored-field round trip, and the staged-country gate. Offline —
 * runs on the 35 opportunities and notice texts saved on 2026-09-27.
 */
import fixture from "../lib/ingestion/__fixtures__/guyana-eprocure-2026-09-27.json" with { type: "json" };
import { parseGuyanaOpportunity, type GuyanaOpportunity } from "../lib/ingestion/connectors/guyana-eprocure-live";
import { ingestGuyana } from "../lib/ingestion/ingest-guyana";
import { readGuyanaDocumentAccess } from "../lib/ingestion/guyana-document-access";
import { buildRowWithProtectedValues } from "../lib/ingestion/upsert-tenders";
import { guyanaBuyer, guyanaLocation, guyanaTitle } from "../lib/ingestion/guyana-mapper";
import { guyanaTitleEstimateGyd, readGuyanaNotice } from "../lib/relevance-guyana";
import { classifyStoredTender } from "../lib/relevance";
import { isStagedCountry } from "../lib/staged-countries";
import { sourceLanguageFor } from "../lib/ingestion/source-language";
import { JSON_SHAPE_INSTRUCTIONS, JSON_SHAPE_INSTRUCTIONS_EN, jsonShapeInstructionsFor, systemPromptFor } from "../lib/ingestion/extract-requirements";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

async function main() {
  // --- Parsing -----------------------------------------------------------------
  const opportunities = (fixture.api as unknown[]).map(parseGuyanaOpportunity).filter((row): row is GuyanaOpportunity => row !== null);
  check("all 35 rows parse", opportunities.length, 35);
  check("row without id is dropped", parseGuyanaOpportunity({ project_name: "x", advertisement_date: "2026-09-01" }), null);
  const road = opportunities.find((row) => row.projectId === "PROC-2026-00425")!;
  check("bid opening date", road.bidOpeningDate, "2026-10-02");
  check("document url is absolute and encoded", road.documents[0]?.url, "https://eprocure.gov.gy/files/SPN-%20P501759-CW-1.pdf");

  // --- Small helpers -------------------------------------------------------------
  check("title loses the typed '1.'", guyanaTitle("1.\tConstruction of Control Structure at Nabaclis"), "Construction of Control Structure at Nabaclis");
  check("title loses a pasted Word bullet (U+F076)", guyanaTitle("\uF076\tDrilling of Potable Water Wells at Amelia\u2019s Ward"), "Drilling of Potable Water Wells at Amelia\u2019s Ward");
  check("buyer loses the numeric prefix", guyanaBuyer("34-Ministry of Public Utilities and Aviation"), "Ministry of Public Utilities and Aviation");
  check("regions named", guyanaLocation(["Region 04", "Region 10"]), "Region 4 (Demerara-Mahaica); Region 10 (Upper Demerara-Berbice)");
  check("unknown region dropped", guyanaLocation(["Region 99"]), undefined);
  check("EE$ estimate", guyanaTitleEstimateGyd("Drainage Structure (EE$36,086,600) RETENDER"), 36086600);
  check("no estimate", guyanaTitleEstimateGyd("Supply of Insulators"), null);
  check("ICB notice", readGuyanaNotice("… ICB No: GWI – CDB – W104 – 2026 … Caribbean Development Bank …"), { competition: "international", financier: "Caribbean Development Bank" });
  check("World Bank RFB", readGuyanaNotice("Credit No.: IDA-77040 … through the international competitive procurement using Request for Bids"), { competition: "international", financier: "World Bank" });
  check("World Bank RFQ is national", readGuyanaNotice("financing from the World Bank … national competitive procurement using a Request for Quotation (RFQ)"), { competition: "national", financier: "World Bank" });
  check("NCB", readGuyanaNotice("Bidding will be conducted through the National Competitive Bidding (NCB) procedures"), { competition: "national", financier: null });
  check("no text", readGuyanaNotice(null), { competition: null, financier: null });

  // --- The rule on the real 35 ---------------------------------------------------
  const noticeByUrl = new Map<string, string | null>();
  const texts = fixture.noticeText as Record<string, string | null>;
  for (const row of opportunities) for (const doc of row.documents) noticeByUrl.set(doc.url, texts[row.projectId] ?? null);
  const result = await ingestGuyana(null, { write: false, opportunities, noticeText: async (url) => noticeByUrl.get(url) ?? null, now: new Date("2026-09-27T12:00:00Z") });
  const tierOf = (id: string) => result.rows.find((row) => row.opportunity.projectId === id)?.tender.relevance.tier;
  check("6 of 35 kept", result.kept.length, 6);
  check("kept ids", result.kept.map((tender) => tender.tenderNumber).sort(), ["PROC-2026-00425", "PROC-2026-00427", "PROC-2026-00428", "PROC-2026-00429", "PROC-2026-00430", "PROC-2026-00431"]);
  check("World Bank road is flagship", tierOf("PROC-2026-00425"), "flagship");
  check("scanned Bath lot borrows its siblings' facts", result.rows.find((row) => row.opportunity.projectId === "PROC-2026-00428")?.factsFrom, "sibling");
  check("World Bank calculators excluded", tierOf("PROC-2026-00458"), "excluded");
  check("NCB wells excluded", tierOf("PROC-2026-00443"), "excluded");
  check("GPL NCB materials excluded", tierOf("PROC-2026-00447"), "excluded");
  check("security services excluded", tierOf("PROC-2026-00434"), "excluded");
  check("every kept row is Guyana", result.kept.every((tender) => tender.country === "Guyana"), true);
  const roadTender = result.kept.find((tender) => tender.tenderNumber === "PROC-2026-00425")!;
  check("deadline is 09:00 Georgetown", roadTender.submissionDeadline, "2026-10-02T13:00:00.000Z");
  check("road tagged transport", roadTender.industries, ["transportation"]);
  check("road procedure carries ICB", roadTender.procedureType, "Open Tendered — International Competitive Bidding (ICB)");

  // --- How to obtain the bid documents (详情页「这个项目的标书怎么拿」) -----------
  const accessOf = (id: string) => readGuyanaDocumentAccess(texts[id] ?? null);
  const roadAccess = accessOf("PROC-2026-00425")!;
  check("World Bank road: requested, sent by email, inspectable, no fee", [roadAccess.byEmail, roadAccess.inspection, roadAccess.fee, roadAccess.free], [true, true, undefined, undefined]);
  check("road excerpt says it is sent by email", roadAccess.excerpt.includes("The document will be sent by email."), true);
  check("road excerpt leaves out the bid-submission marking", roadAccess.excerpt.includes("Request for Bids: Improvement"), false);
  const leguan = accessOf("PROC-2026-00427")!;
  check("GWI lot: G$5,000, courier, inspection", [leguan.fee, leguan.courier, leguan.inspection, leguan.collectInPerson], [{ amount: 5000, currency: "GYD" }, true, true, undefined]);
  check("GWI lot: request heading verbatim", leguan.requestTitle, "Request for Bid Documents for the Supply and Installation of Transmission Mains at Leguan, Region # 3");
  check("GWI lot with no closing quote still gives its heading", accessOf("PROC-2026-00429")?.requestTitle, "Request for Bid Documents for the Supply and Installation of Transmission Mains at Adventure, Region # 6 (Lot 1-4)");
  check("HECI: download from electricity.gov.gy", [accessOf("PROC-2026-00432")?.downloadUrl, accessOf("PROC-2026-00432")?.downloadNeedsForm], ["https://www.electricity.gov.gy", undefined]);
  check("HECI solar: download needs an online form", accessOf("PROC-2026-00448")?.downloadNeedsForm, true);
  check("GuySuCo: download or printed for G$2,000", [accessOf("PROC-2026-00460")?.downloadUrl, accessOf("PROC-2026-00460")?.fee?.amount, accessOf("PROC-2026-00460")?.collectInPerson], ["https://www.guysuco.com", 2000, true]);
  check("CH&PA: flash drive for G$10,000, collected", [accessOf("PROC-2026-00435")?.flashDrive, accessOf("PROC-2026-00435")?.fee?.amount, accessOf("PROC-2026-00435")?.collectInPerson], [true, 10000, true]);
  check("GPL: uplifted for $5,000", [accessOf("PROC-2026-00446")?.fee?.amount, accessOf("PROC-2026-00446")?.collectInPerson], [5000, true]);
  check("Agriculture: free by email, or a G$5,000 flash drive", [accessOf("PROC-2026-00459")?.byEmail, accessOf("PROC-2026-00459")?.free, accessOf("PROC-2026-00459")?.fee?.amount], [true, true, 5000]);
  check("no text → no access", accessOf("PROC-2026-00433"), null);
  const bath = result.rows.find((row) => row.opportunity.projectId === "PROC-2026-00428")!.tender.bidDocumentAccess;
  check("scanned Bath lot borrows a sibling's route, without its heading", [bath?.fromSibling, bath?.fee?.amount, bath?.requestTitle], [true, 5000, undefined]);
  check("every Guyana tender carries the field (null or not)", result.rows.every((row) => row.tender.bidDocumentAccess !== undefined), true);
  check("Guyana row writes bid_document_access", "bid_document_access" in buildRowWithProtectedValues(roadTender, undefined), true);
  const { bidDocumentAccess: _omitted, ...otherSource } = roadTender;
  void _omitted;
  check("a source that never sets it does not name the column", "bid_document_access" in buildRowWithProtectedValues(otherSource, undefined), false);

  // Reclassify from stored fields must give every row the tier it was imported with.
  for (const row of result.rows) {
    const t = row.tender;
    const again = classifyStoredTender({
      title: t.title.es, summary: t.summary.es, buyer: t.buyer, country: t.country, procedureType: t.procedureType,
      tenderNumber: t.tenderNumber, governmentLevel: t.governmentLevel, scopeType: t.scopeType,
      estimatedValue: t.estimatedValue, currency: t.currency, sourceName: t.sourceName,
    });
    if (row.factsFrom === "none") continue;
    check(`stored-field parity ${t.tenderNumber}`, [again.relevance.tier, again.industries], [t.relevance.tier, t.industries]);
  }

  // NCB with a big estimate is kept, a small one is not.
  const base = opportunities.find((row) => row.projectId === "PROC-2026-00451")!;
  const big = await ingestGuyana(null, {
    write: false,
    opportunities: [{ ...base, projectName: "Construction of Drainage Structure at Stanleytown (EE$450,000,000)" }],
    noticeText: async () => "National Competitive Bidding (NCB)",
  });
  check("NCB above US$1M kept as 中型", big.rows[0]?.tender.relevance.tier, "significant");
  check("estimate stored in GYD", [big.rows[0]?.tender.estimatedValue, big.rows[0]?.tender.currency], [450000000, "GYD"]);
  const empty = await ingestGuyana(null, { write: false, opportunities: [base], noticeText: async () => null });
  check("no notice readable → warning", empty.staleWarning?.includes("一份招标公告都没读出文字"), true);

  // --- Staging and language ------------------------------------------------------
  check("Guyana is staged", isStagedCountry("Guyana"), true);
  check("open countries are not", ["Mexico", "Brazil", "Colombia", "Peru", "Chile"].map(isStagedCountry), [false, false, false, false, false]);
  check("null country is not staged", isStagedCountry(null), false);
  check("Guyana is English", sourceLanguageFor("Guyana"), "en");
  check("Brazil still Portuguese", sourceLanguageFor("Brazil"), "pt");
  check("English extraction prompt", systemPromptFor("en").includes("Guyanese"), true);
  check("English JSON instructions differ", JSON_SHAPE_INSTRUCTIONS_EN !== JSON_SHAPE_INSTRUCTIONS && jsonShapeInstructionsFor("en").includes("source document is in English"), true);

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
