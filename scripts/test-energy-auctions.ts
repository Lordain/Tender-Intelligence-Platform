/**
 * The hand-kept energy auctions (lib/ingestion/energy-auctions.ts): every
 * record is consistent with itself and survives the write unchanged.
 *
 * Usage: npm run test:energy-auctions
 */
import { ENERGY_AUCTIONS, energyAuctionToTender } from "../lib/ingestion/energy-auctions";
import { classifyStoredTender } from "../lib/relevance";
import { isPastSubmissionDeadline } from "../lib/ingestion/recency";
import { isStagedCountry } from "../lib/staged-countries";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const NOW = new Date("2026-10-04T12:00:00Z");
console.log("energy-auctions\n");
check("slug 不重复", new Set(ENERGY_AUCTIONS.map((a) => a.slug)).size, ENERGY_AUCTIONS.length);
for (const auction of ENERGY_AUCTIONS) {
  const tender = energyAuctionToTender(auction, NOW);
  const reclassified = classifyStoredTender({
    title: tender.title.es,
    summary: tender.summary.es,
    buyer: tender.buyer,
    country: tender.country,
    procedureType: tender.procedureType,
    tenderNumber: tender.tenderNumber,
    governmentLevel: tender.governmentLevel,
    scopeType: tender.scopeType,
    sourceName: tender.sourceName,
  });
  console.log(`\n${auction.tenderNumber}`);
  check("重新分级仍是大型、电力", [reclassified.relevance.tier, reclassified.industries], ["flagship", ["power"]]);
  check("有来源", auction.sources.length > 0 && auction.sources.includes(auction.sourceUrl), true);
  check("中文标题和摘要都写了", Boolean(tender.title.zh && tender.summary.zh && tender.title.zh !== tender.title.es), true);
  check("国家已对外开放", isStagedCountry(tender.country), false);
  if (tender.status === "awarded") check("已中标有授标日期", Boolean(tender.awardDate), true);
  if (tender.status === "open") check("招标中的截标日期还没过", isPastSubmissionDeadline(tender, NOW), false);
  if (tender.submissionDeadline) check("发布早于截标", Date.parse(tender.publicationDate) < Date.parse(tender.submissionDeadline), true);
}

if (failures > 0) {
  console.log(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
