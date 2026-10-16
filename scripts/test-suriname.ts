/**
 * Suriname (gov.sr 「Aanbestedingen」, staged 2026-10-16): reading each post's
 * procedure, bid deadline, pre-bid meeting, clarification deadline and
 * financier; the user's rule (A — Guyana's); what a run writes; the
 * stored-field round trip and the staged-country gate. Offline — runs on the
 * 15 posts saved on 2026-10-16 (email addresses removed).
 */
import fixture from "../lib/ingestion/__fixtures__/suriname/aanbestedingen-2026-10-16.json" with { type: "json" };
import type { SurinamePost } from "../lib/ingestion/connectors/suriname-govsr-live";
import { parseSurinamePost, postText } from "../lib/ingestion/suriname-notice";
import { mapSurinameNoticeToTender, surinameScopeType } from "../lib/ingestion/suriname-mapper";
import { ingestSuriname } from "../lib/ingestion/ingest-suriname";
import { classifyStoredTender } from "../lib/relevance";
import { isStagedCountry } from "../lib/staged-countries";
import { sourceLanguageFor } from "../lib/ingestion/source-language";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

/** Paramaribo wall-clock "YYYY-MM-DD HH:MM", or null. */
function local(iso: string | undefined): string | null {
  return iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Paramaribo" }).slice(0, 16) : null;
}

const posts = fixture as SurinamePost[];
const notices = new Map(posts.map((post) => [post.id, parseSurinamePost(post)]));
const get = (id: number) => notices.get(id)!;

check("15 posts read", notices.size, 15);

// Bid deadline, each of the six ways it is written.
check("Month-first date with year and time", local(get(162550).deadline), "2026-10-28 11:00");
check("Day-first date with year and time", local(get(162218).deadline), "2026-11-04 11:00");
check("Date without a year takes the post's year", local(get(160468).deadline), "2026-09-04 11:00");
check("「Submission & Opening Deadline: 21 Augst 2026 before 11:00」", local(get(159809).deadline), "2026-08-21 11:00");
check("「The deadline for bid submission is 13 July 2026 at 11:00 am」", local(get(157139).deadline), "2026-07-13 11:00");
check("Expressions of interest by「24 th of July 2026」, end of day", local(get(158588).deadline), "2026-07-24 23:59");
check("Expressions of interest by 16 October 2026", local(get(162300).deadline), "2026-10-16 23:59");
check("Bidding-document text with the dates in the PDF: no deadline, not a guess", get(162393).deadline, undefined);

// The clarification deadline comes first on the page and is not the bid deadline.
check("Clarification deadline read on its own", local(get(162550).clarificationsUntil), "2026-10-12 23:59");
check("Pre-bid meeting after 「Address: S.M. Jamaludinstraat no. 26 (…). Date & Time:」", local(get(162550).preBidMeeting), "2026-10-07 10:00");
check("Pre-bid meeting written 「Pre ‑ Bid Meeting: 5 October 2026」", local(get(162218).preBidMeeting), "2026-10-05 10:00");
check("Pre-bid meeting 「held on Wednesday 12 August 2026」", local(get(159809).preBidMeeting), "2026-08-12 10:00");

// Procedure and financier.
check("ICB", get(162550).method, "icb");
check("NCB", get(161433).method, "ncb");
check("Expression of interest", get(156974).method, "eoi");
check("No method stated", get(159809).method, null);
check("Social Bond", get(162550).financier, "Social Bond");
check("IDB-financed", get(157139).financier, "Inter-American Development Bank");
check("Beneficiary read", get(162550).beneficiary, "Academic Hospital Paramaribo");
check("Notice PDF found", get(162550).documents, ["https://gov.sr/wp-content/uploads/2026/09/SPN_Medical-Equipment-1_AZP-final-1.pdf"]);

// Scope.
check("「Supply of Equipment for School Renovation Works」 is equipment, not works", surinameScopeType(get(161437)), "equipment");
check("Design and Build is works", surinameScopeType(get(162218)), "works");
check("Expression of interest is consulting", surinameScopeType(get(162300)), "consulting");
check("Scope section kept in short", (get(162218).scope ?? "").startsWith("Design Phase: Planning and analysis"), true);

// No contact details stored.
check("Email addresses dropped from the text", postText('Email: <a href="mailto:x@y.gov.sr">procurement@oversightboard.gov.sr</a> end'), "Email: end");
const mapped = posts.map((post) => mapSurinameNoticeToTender(parseSurinamePost(post), new Date("2026-10-16T12:00:00Z")));
check("No email address in any mapped row", mapped.filter((tender) => /@/.test(JSON.stringify(tender))).length, 0);
check("Slug from the post id", mapped[0].slug, "suriname-govsr-162550");
check("Country", [...new Set(mapped.map((tender) => tender.country))], ["Suriname"]);

// The rule (user, 2026-10-16: A — Guyana's): ICB works and equipment kept.
const tierOf = new Map(mapped.map((tender) => [Number(tender.slug.replace("suriname-govsr-", "")), tender.relevance.tier]));
check("Hospital equipment and furniture, ICB: 中型 (furniture next to equipment does not exclude)", tierOf.get(162550), "significant");
check("Reeberg design and build, ICB works: 中型", tierOf.get(162218), "significant");
check("Heavy machinery, ICB: 中型", tierOf.get(157205), "significant");
check("IDB data-centre equipment, ICB: 中型", tierOf.get(157139), "significant");
check("School furniture alone, ICB: excluded", tierOf.get(159578), "excluded");
check("Learning books, ICB: excluded", tierOf.get(160468), "excluded");
check("EPD hardware, NCB: excluded", tierOf.get(161433), "excluded");
check("Turf fields, NCB: excluded", tierOf.get(157385), "excluded");
check("Expression of interest: excluded", tierOf.get(162300), "excluded");
check("No method stated: excluded", tierOf.get(159809), "excluded");
check("6 of 15 kept", mapped.filter((tender) => tender.relevance.tier !== "excluded").length, 6);
check("Industry: hospital → healthcare", mapped.find((tender) => tender.slug === "suriname-govsr-162550")?.industries, ["healthcare"]);
check("Industry: machinery → heavy_equipment", mapped.find((tender) => tender.slug === "suriname-govsr-157205")?.industries, ["heavy_equipment"]);
check("Industry: data storage → ict_telecom", mapped.find((tender) => tender.slug === "suriname-govsr-157139")?.industries, ["ict_telecom"]);
check("Industry: design and build housing → construction", mapped.find((tender) => tender.slug === "suriname-govsr-162218")?.industries, ["construction"]);

// Stored-field round trip: reclassify from what the row keeps gives the same tier.
for (const tender of mapped) {
  const again = classifyStoredTender({
    title: tender.title.es,
    summary: tender.summary.es,
    buyer: tender.buyer,
    country: tender.country,
    governmentLevel: tender.governmentLevel,
    scopeType: tender.scopeType,
    procedureType: tender.procedureType,
    tenderNumber: tender.tenderNumber,
    sourceName: tender.sourceName,
  });
  check(`Round trip ${tender.slug}`, again.relevance.tier, tender.relevance.tier);
}

// What a run on 16 October writes: the kept calls still taking bids.
async function run() {
  const result = await ingestSuriname(null, { write: false, posts, now: new Date("2026-10-16T12:00:00Z") });
  check("Written on 2026-10-16: hospital equipment and Reeberg", result.kept.map((tender) => tender.slug).sort(), ["suriname-govsr-162218", "suriname-govsr-162550"]);
  check("Kept but closed are not written", result.rows.filter((row) => row.outcome === "closed").length, 4);
  check("No stale warning with posts", result.staleWarning, null);
  const empty = await ingestSuriname(null, { write: false, posts: [] });
  check("Stale warning when the category returns nothing", empty.staleWarning !== null, true);

  // Staged: admin pages only; English originals.
  check("Suriname is staged", isStagedCountry("Suriname"), true);
  check("Suriname originals are English", sourceLanguageFor("Suriname"), "en");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
