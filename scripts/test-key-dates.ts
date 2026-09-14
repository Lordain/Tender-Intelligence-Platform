/**
 * Behaviour tests for the four pure pieces of the key-date pipeline:
 * toCalendarDay() (what a model is allowed to have read off a page),
 * findKeyDateProblems() (which of those readings cannot be true),
 * isPastSubmissionDeadline() (which tenders are too late to import at all)
 * and deriveTenderStatus()'s validity_end rule.
 *
 * Dates are the one extracted field that is ACTED on rather than read — they
 * drive 交标截止日, the 招标中/已截止 status and the digest — and the single
 * most dangerous input is the one that parses successfully into the wrong
 * day: every country this platform reads writes 10/09/2026 for 10 September,
 * while `new Date("10/09/2026")` answers October 9th without complaint.
 *
 * No network, no database.
 *
 * Usage: npm run test:key-dates
 */
import { ExtractionSchema, JSON_SHAPE_INSTRUCTIONS, normalizeRawExtraction, toCalendarDay } from "../lib/ingestion/extract-requirements";
import { findKeyDateProblems, submissionIsSuspect, swapDayAndMonth } from "../lib/ingestion/key-date-checks";
import { diffAgainstExisting, parseSeaceCronograma } from "../lib/ingestion/seace-cronograma";
import { isPastSubmissionDeadline } from "../lib/ingestion/recency";
import { deriveTenderStatus, platformDay } from "../lib/tender-status";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-09-12T12:00:00.000Z");

// toCalendarDay: what gets through
check("a plain ISO day passes", toCalendarDay("2026-09-10", NOW) === "2026-09-10");
check("surrounding whitespace is tolerated", toCalendarDay("  2026-09-10  ", NOW) === "2026-09-10");

// toCalendarDay: what must NOT get through
check("a DD/MM/YYYY date is rejected, not guessed", toCalendarDay("10/09/2026", NOW) === null, String(toCalendarDay("10/09/2026", NOW)));
check("a Spanish long date is rejected", toCalendarDay("10 de septiembre de 2026", NOW) === null);
check("an ISO timestamp is rejected (day only)", toCalendarDay("2026-09-10T23:59:00-05:00", NOW) === null);
check("a day that does not exist is rejected", toCalendarDay("2026-02-30", NOW) === null);
check("a single-digit month is rejected", toCalendarDay("2026-9-10", NOW) === null);
check("an empty string is rejected", toCalendarDay("", NOW) === null);
check("a year far in the past is rejected", toCalendarDay("2014-09-10", NOW) === null);
check("a year far in the future is rejected", toCalendarDay("2099-09-10", NOW) === null);
check("next year is still accepted", toCalendarDay("2027-03-01", NOW) === "2027-03-01");

// deriveTenderStatus: the validity_end rule
const publication = { type: "publication" as const, date: "2026-01-01" };
check(
  "no dates at all still reads 招标中",
  deriveTenderStatus("open", { keyDates: [publication] }, NOW) === "open",
);
check(
  "a passed validity_end closes the tender",
  deriveTenderStatus("open", { keyDates: [publication, { type: "validity_end", date: "2026-09-11" }] }, NOW) === "submission_closed",
);
check(
  "a future validity_end leaves it open",
  deriveTenderStatus("open", { keyDates: [publication, { type: "validity_end", date: "2028-08-27" }] }, NOW) === "open",
);
check(
  "validity_end on today itself has not passed",
  deriveTenderStatus("open", { keyDates: [{ type: "validity_end", date: "2026-09-12" }] }, NOW) === "open",
);
check(
  "an awarded tender is not reopened or re-closed by validity_end",
  deriveTenderStatus("awarded", { keyDates: [{ type: "validity_end", date: "2026-09-11" }] }, NOW) === "awarded",
);
check(
  "a passed submission deadline still wins on its own",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-01", keyDates: [] }, NOW) === "submission_closed",
);
check(
  "clarification day still beats plain open when nothing has expired",
  deriveTenderStatus("open", { keyDates: [{ type: "clarification", date: "2026-09-12" }] }, NOW) === "clarification",
);

// The off-by-one that made both of the above wrong for a year (see
// platformDay's own comment): every date this code receives from Supabase is
// a `date` column, returned as a bare "YYYY-MM-DD".
check("a bare date column value is not shifted by the timezone", platformDay("2026-09-12") === "2026-09-12", String(platformDay("2026-09-12")));
check("a real timestamp is still converted to its Mexico City day", platformDay("2026-09-13T03:00:00.000Z") === "2026-09-12", String(platformDay("2026-09-13T03:00:00.000Z")));
check(
  "a tender does NOT read 已截止 on the morning of its own deadline",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-12", keyDates: [] }, NOW) === "open",
);
check(
  "it does the day after",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-11", keyDates: [] }, NOW) === "submission_closed",
);

// Rule 5: the 45-day last resort, and the four things that must outrank it.
check(
  "a date-less tender stays open inside the window",
  deriveTenderStatus("open", { publicationDate: "2026-09-01", keyDates: [] }, NOW) === "open",
);
check(
  "a date-less tender closes once the window has passed",
  deriveTenderStatus("open", { publicationDate: "2026-07-01", keyDates: [] }, NOW) === "submission_closed",
);
check(
  "exactly 45 days is still open",
  deriveTenderStatus("open", { publicationDate: "2026-07-29", keyDates: [] }, NOW) === "open",
  String(daysBetweenForTest("2026-07-29")),
);
check(
  "46 days is not",
  deriveTenderStatus("open", { publicationDate: "2026-07-28", keyDates: [] }, NOW) === "submission_closed",
);
check(
  "a FUTURE deadline outranks the window — an old tender open until December stays open",
  deriveTenderStatus("open", { publicationDate: "2026-01-01", submissionDeadline: "2026-12-01", keyDates: [] }, NOW) === "open",
);
check(
  "a future validity_end outranks it too (PEMEX standing invitations)",
  deriveTenderStatus("open", { publicationDate: "2026-01-01", keyDates: [{ type: "validity_end", date: "2028-08-27" }] }, NOW) === "open",
);
check(
  "an award outranks it — a long-decided tender still reads 已中标, not 已截止",
  deriveTenderStatus("awarded", { publicationDate: "2026-01-01", keyDates: [] }, NOW) === "awarded",
);
check(
  "a junta de aclaraciones happening today outranks it",
  deriveTenderStatus("open", { publicationDate: "2026-01-01", keyDates: [{ type: "clarification", date: "2026-09-12" }] }, NOW) === "clarification",
);
check(
  "no publication date at all means the window cannot fire",
  deriveTenderStatus("open", { keyDates: [] }, NOW) === "open",
);

// findKeyDateProblems: the wrong day that toCalendarDay cannot see.
//
// Half of these assert that a check does NOT fire. That is the point: the
// reason this checker refuses to look at site_visit vs clarification, or at
// a schedule where every row lands on one day, is that those shapes are
// common and correct — and a warning that fires on a right answer is worse
// than no warning at all, because it trains the reader to skip all of them.
const CRONOGRAMA = [
  { type: "clarification" as const, date: "2026-09-01" },
  { type: "submission" as const, date: "2026-09-10" },
  { type: "opening" as const, date: "2026-09-10" },
  { type: "award" as const, date: "2026-09-18" },
  { type: "contract_signing" as const, date: "2026-10-01" },
];

check("a well-formed cronograma raises nothing", findKeyDateProblems(CRONOGRAMA).length === 0, JSON.stringify(findKeyDateProblems(CRONOGRAMA)));
check(
  "the same day for submission, opening and award is fine (Peru's Adjudicación Simplificada)",
  findKeyDateProblems([
    { type: "submission", date: "2026-09-10" },
    { type: "opening", date: "2026-09-10" },
    { type: "award", date: "2026-09-10" },
  ]).length === 0,
);
check(
  "questions closing after the junta is not flagged — a second session can answer them",
  findKeyDateProblems([
    { type: "clarification", date: "2026-09-02" },
    { type: "questions_deadline", date: "2026-09-04" },
    { type: "submission", date: "2026-09-20" },
  ]).length === 0,
);
check(
  "a site visit after the bids are due IS flagged",
  findKeyDateProblems([
    { type: "site_visit", date: "2026-09-25" },
    { type: "submission", date: "2026-09-20" },
  ])[0]?.code === "out-of-order",
);

// The swap: the document writes 10/09/2026 for 10 September, the model
// answers 9 October, and every other row of the schedule stays put.
const SWAPPED = [
  { type: "submission" as const, date: "2026-10-09" },
  { type: "opening" as const, date: "2026-09-15" },
  { type: "award" as const, date: "2026-09-30" },
];
const swappedProblems = findKeyDateProblems(SWAPPED);
check("a day/month swap on the deadline is caught", swappedProblems.length === 1, JSON.stringify(swappedProblems));
check("it is reported once, not once per row it now contradicts", swappedProblems.length === 1);
check("the deadline is marked suspect, so it will not be written to the tender", submissionIsSuspect(swappedProblems));
check(
  "the message names the corrected reading rather than only the conflict",
  swappedProblems[0]?.message.includes("2026-09-10") === true,
  swappedProblems[0]?.message,
);
check(
  "and quotes it the way the document writes it, DD/MM",
  swappedProblems[0]?.message.includes("10/09") === true,
  swappedProblems[0]?.message,
);

check(
  "an award read before the bids are due is caught too",
  findKeyDateProblems([
    { type: "submission", date: "2026-09-20" },
    { type: "award", date: "2026-08-05" },
  ]).length === 1,
);
check(
  "a disagreement that does not involve the deadline leaves the deadline writable",
  submissionIsSuspect(
    findKeyDateProblems([
      { type: "submission", date: "2026-09-10" },
      { type: "award", date: "2026-10-20" },
      { type: "contract_signing", date: "2026-10-01" },
    ]),
  ) === false,
);

// Against the publication date the source feed supplies.
check(
  "a cronograma that predates the tender's own publication is flagged",
  findKeyDateProblems(CRONOGRAMA, { publicationDate: "2026-11-01" }).some((p) => p.code === "before-publication"),
);
check(
  "one day of slack is allowed, for a publication timestamp that lands on the next UTC day",
  findKeyDateProblems([{ type: "submission", date: "2026-09-10" }], { publicationDate: "2026-09-11" }).length === 0,
);
check(
  "a misread year is flagged as too far out",
  findKeyDateProblems([{ type: "submission", date: "2028-09-10" }], { publicationDate: "2026-08-20" }).some(
    (p) => p.code === "far-after-publication",
  ),
);
check(
  "a genuinely long obra — award ten months out — is not",
  findKeyDateProblems(
    [
      { type: "submission", date: "2026-09-10" },
      { type: "award", date: "2027-06-01" },
    ],
    { publicationDate: "2026-08-20" },
  ).length === 0,
);
check(
  "a misread year hitting every row is reported once, not once per row",
  findKeyDateProblems(
    [
      { type: "submission", date: "2029-09-10" },
      { type: "opening", date: "2029-09-12" },
      { type: "award", date: "2029-09-20" },
    ],
    { publicationDate: "2026-08-20" },
  ).length === 1,
);
check(
  "publication and validity_end rows are ignored — neither is read from a document",
  findKeyDateProblems([
    { type: "publication", date: "2026-09-01" },
    { type: "validity_end", date: "2028-01-01" },
    { type: "submission", date: "2026-09-10" },
  ]).length === 0,
);
check("no dates at all is not a problem", findKeyDateProblems([]).length === 0);

// swapDayAndMonth on its own: it may only ever propose a reading the
// document could actually have carried.
check("a swap the document could have carried is offered", swapDayAndMonth("2026-10-09") === "2026-09-10");
check("a day past 12 has nothing to swap with", swapDayAndMonth("2026-10-25") === null);
check("a swap onto a day that does not exist is refused", swapDayAndMonth("2026-02-30") === null, String(swapDayAndMonth("2026-02-30")));
check("a swap onto 31 February is refused", swapDayAndMonth("2026-31-02") === null);

// isPastSubmissionDeadline: the import gate.
//
// It has to agree with deriveTenderStatus() above about the same tender on
// the same day. An import that rejected a tender the site would still show
// as 招标中 — or admitted one the site immediately marks 已截止 — would be
// its own bug, so the boundary cases here deliberately mirror that block's.
check(
  "a tender whose deadline was yesterday is not imported",
  isPastSubmissionDeadline({ submissionDeadline: "2026-09-11", status: "open" }, NOW),
);
check(
  "a tender due TODAY is still imported — the same morning-of rule the site applies",
  isPastSubmissionDeadline({ submissionDeadline: "2026-09-12", status: "open" }, NOW) === false,
);
check(
  "a future deadline is imported",
  isPastSubmissionDeadline({ submissionDeadline: "2026-12-01", status: "open" }, NOW) === false,
);
check(
  "no deadline at all is not grounds to reject — most Mexican sources publish none",
  isPastSubmissionDeadline({ status: "open" }, NOW) === false,
);
check(
  "an awarded tender keeps its place, though its deadline has passed by definition",
  isPastSubmissionDeadline({ submissionDeadline: "2025-01-01", status: "awarded" }, NOW) === false,
);
check(
  "a 2024 deadline is rejected however recent the publication date looks",
  isPastSubmissionDeadline({ submissionDeadline: "2024-12-10", status: "open" }, NOW),
);
check(
  "a source-supplied timestamp, not just a bare day, is handled",
  isPastSubmissionDeadline({ submissionDeadline: "2026-09-11T23:59:00-05:00", status: "open" }, NOW),
);
check(
  "an unparseable deadline is not grounds to reject either",
  isPastSubmissionDeadline({ submissionDeadline: "pendiente", status: "open" }, NOW) === false,
);

// normalizeRawExtraction: the response-shape repair that stands between a
// provider omitting a key and the whole document being thrown away.
// Regression guard for the real 2026-09-13 outage — keyDates was added to
// ExtractionSchema as a required array but not to the (then hand-written)
// default list, so five real Peru bases PDFs failed validation outright and
// lost their requirements and risks along with the dates.
const MINIMAL_MODEL_RESPONSE = { oneLineSummary: "为某医院采购医疗设备" };

check(
  "a response omitting every array still validates",
  ExtractionSchema.safeParse(normalizeRawExtraction({ ...MINIMAL_MODEL_RESPONSE })).success,
);
check(
  "every array field the schema declares gets defaulted, keyDates included",
  Object.entries(ExtractionSchema.shape)
    .filter(([, field]) => (field as { _zod?: { def?: { type?: string } } })?._zod?.def?.type === "array")
    .every(([key]) => Array.isArray((normalizeRawExtraction({ ...MINIMAL_MODEL_RESPONSE }) as Record<string, unknown>)[key])),
);
check(
  "an omitted oneLineSummary does not fail the document either",
  ExtractionSchema.safeParse(normalizeRawExtraction({})).success,
);
check(
  "a schedule the model DID return is passed through untouched, not blanked",
  (() => {
    const returned = [{ type: "submission", date: "2026-10-02", notes: null, sourceReference: "página 7, Cronograma" }];
    const parsed = ExtractionSchema.safeParse(normalizeRawExtraction({ ...MINIMAL_MODEL_RESPONSE, keyDates: returned }));
    return parsed.success && parsed.data.keyDates.length === 1 && parsed.data.keyDates[0].date === "2026-10-02";
  })(),
);
check(
  "a genuinely malformed key still fails loudly rather than being repaired",
  ExtractionSchema.safeParse(normalizeRawExtraction({ ...MINIMAL_MODEL_RESPONSE, risks: "none found" })).success === false,
);
check(
  "a top-level array — a real provider response shape — is left alone to fail",
  ExtractionSchema.safeParse(normalizeRawExtraction([])).success === false,
);
check(
  "the manual-JSON prompt actually asks for the key it requires",
  JSON_SHAPE_INSTRUCTIONS.includes('"keyDates"'),
);

// parseSeaceCronograma: the SEACE ficha table an admin pastes in. This is
// the ONLY place a Peru bid deadline is published (see the file's header),
// so a mis-read column or a month/day swap here writes a wrong deadline
// straight onto the tender.
//
// The fixture is the real table for LP-SM-1-2026-MPDAC-YHCA-1, copied as a
// browser hands it over: tab-separated, with three cells wrapping onto a
// second line.
const REAL_FICHA = [
  "Etapa\tFecha Inicio\tFecha Fin",
  "Convocatoria\t10/09/2026\t10/09/2026",
  "Registro de participantes(Electronica)\t11/09/2026 00:01\t12/10/2026 23:59",
  "Formulación de consultas y observaciones(Electronica)\t11/09/2026 00:01\t21/09/2026 23:59",
  "Absolución de consultas y observaciones(Electronica)\t22/09/2026\t22/09/2026",
  "Integración de las Bases",
  "MUNICIPALIDAD PROVINCIAL DANIEL ALCIDES CARRION\t22/09/2026\t22/09/2026",
  "Presentación de propuestas(Electronica)\t13/10/2026 00:01\t13/10/2026 23:59",
  "Calificación y Evaluación de propuestas",
  "MUNICIPALIDAD PROVINCIAL DANIEL ALCIDES CARRION\t14/10/2026\t14/10/2026",
  "Otorgamiento de la Buena Pro",
  "MUNICIPALIDAD PROVINCIAL DANIEL ALCIDES CARRION\t14/10/2026 08:30\t14/10/2026",
].join("\n");

const ficha = parseSeaceCronograma(REAL_FICHA);
const fichaDate = (type: string) => ficha.rows.find((r) => r.type === type)?.date;

check("the bid deadline is read — the whole reason this parser exists", fichaDate("submission") === "2026-10-13", String(fichaDate("submission")));
check("13/10/2026 is 13 October, not 10 December", fichaDate("submission") === "2026-10-13");
check(
  "the questions deadline matches what the OCDS feed independently says (enquiryPeriod 2026-09-21)",
  fichaDate("questions_deadline") === "2026-09-21",
);
check("absolución is a clarification, not a second questions deadline", fichaDate("clarification") === "2026-09-22");
check("the buena pro row survives wrapping onto two lines", fichaDate("award") === "2026-10-14");
check("exactly the four storable stages are stored", ficha.rows.length === 4);
check("nothing in a real table is left unparsed", ficha.unparsed.length === 0, ficha.unparsed.join(" | "));
check("the four unstorable stages are reported, not silently dropped", ficha.ignored.length === 4);
check(
  "Convocatoria is refused — publication_date is the feed's and is protected",
  ficha.ignored.some((i) => /Convocatoria/.test(i.label)) && !ficha.rows.some((r) => /Convocatoria/.test(r.label)),
);

// Fecha Fin, not Fecha Inicio. A window whose start and end differ is the
// only case that can tell the two columns apart, and taking the start on
// "Presentación de propuestas" would move a real deadline weeks early.
const window = parseSeaceCronograma("Presentación de propuestas(Electronica)\t01/10/2026 00:01\t13/10/2026 23:59");
check("a window resolves to its END date, never its start", window.rows[0]?.date === "2026-10-13");

// Whitespace-aligned paste (what copying a rendered table sometimes gives).
const aligned = parseSeaceCronograma("Presentación de propuestas       13/10/2026 00:01     13/10/2026 23:59");
check("a whitespace-aligned paste parses too, not just tab-separated", aligned.rows[0]?.date === "2026-10-13");

check(
  "an impossible day is refused rather than rolled into March",
  parseSeaceCronograma("Presentación de propuestas\t31/02/2026\t31/02/2026").rows.length === 0,
);
check(
  "a stage this parser does not know is reported, never guessed at",
  (() => {
    const out = parseSeaceCronograma("Etapa inventada por la entidad\t13/10/2026\t13/10/2026");
    return out.rows.length === 0 && out.unparsed.length === 1;
  })(),
);
check("an empty paste is not an error", parseSeaceCronograma("").rows.length === 0);
check(
  "a single-day stage uses that day for both columns",
  parseSeaceCronograma("Absolución de consultas\t22/09/2026\t22/09/2026").rows[0]?.date === "2026-09-22",
);
// The parsed schedule must also survive the checker that guards every other
// key-date write — a real table has to come out clean.
check(
  "the real ficha passes findKeyDateProblems with no complaint",
  findKeyDateProblems(
    ficha.rows.map((r) => ({ type: r.type, date: r.date })),
    { publicationDate: "2026-09-10" },
  ).length === 0,
);

// ---------------------------------------------------------------------------
// diffAgainstExisting: what a pasted table adds to a tender that already has
// key dates. The first real paste (2026-09-14) put a second 提问截止 on the
// page next to the one the bid document had already yielded — same day, same
// stage, two rows.
// ---------------------------------------------------------------------------
{
  const fichaRows = ficha.rows.filter((row) => row.type !== "submission");

  const noneStored = diffAgainstExisting(fichaRows, []);
  check("with nothing stored, every ficha row is inserted", noneStored.toInsert.length === fichaRows.length);
  check("with nothing stored there are no duplicates", noneStored.duplicates.length === 0);
  check("with nothing stored there are no conflicts", noneStored.conflicts.length === 0);

  // The exact case the user hit: the document pipeline already extracted the
  // questions deadline, and it agrees with the ficha to the day.
  const agreeing = diffAgainstExisting(fichaRows, [
    { type: "questions_deadline", date: "2026-09-21", extractedFromDocument: true },
  ]);
  check(
    "a date the document already yielded is not written a second time",
    agreeing.toInsert.every((row) => row.type !== "questions_deadline"),
  );
  check("the agreeing row is reported as a duplicate", agreeing.duplicates.length === 1);
  check(
    "the duplicate names where the existing row came from",
    agreeing.duplicates[0]?.existingSource === "标书提取",
  );
  check("an agreement is not a conflict", agreeing.conflicts.length === 0);
  check("the other ficha rows still go in", agreeing.toInsert.length === fichaRows.length - 1);

  // Timestamps: Supabase can hand back a full ISO string for a date column.
  const timestamped = diffAgainstExisting(fichaRows, [
    { type: "questions_deadline", date: "2026-09-21T00:00:00.000Z", extractedFromDocument: true },
  ]);
  check("a stored timestamp still matches the same day", timestamped.duplicates.length === 1);

  // Disagreement: both rows are kept, and it is reported.
  const clashing = diffAgainstExisting(fichaRows, [
    { type: "questions_deadline", date: "2026-09-18", sourceReference: "página 7" },
  ]);
  check("a different day for the same stage is a conflict", clashing.conflicts.length === 1);
  check(
    "the conflict carries both dates",
    clashing.conflicts[0]?.storedDate === "2026-09-18" && clashing.conflicts[0]?.row.date === "2026-09-21",
  );
  check(
    "a conflicting ficha row is still inserted, so a human can see both",
    clashing.toInsert.some((row) => row.type === "questions_deadline"),
  );
  check("a conflict is not counted as a duplicate", clashing.duplicates.length === 0);

  // A stored date of an unrelated type must not suppress anything.
  const unrelated = diffAgainstExisting(fichaRows, [{ type: "publication", date: "2026-09-10" }]);
  check("an unrelated stored type changes nothing", unrelated.toInsert.length === fichaRows.length);

  // Re-pasting: the caller strips this endpoint's own rows first, so a second
  // paste of the same table must behave exactly like the first.
  const rePaste = diffAgainstExisting(fichaRows, []);
  check("re-pasting the same table is idempotent", rePaste.toInsert.length === noneStored.toInsert.length);
}

function daysBetweenForTest(day: string): number {
  return Math.floor((new Date("2026-09-12T00:00:00.000Z").getTime() - new Date(`${day}T00:00:00.000Z`).getTime()) / 86_400_000);
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
