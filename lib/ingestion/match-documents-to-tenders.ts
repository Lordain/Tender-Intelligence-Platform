/**
 * Works out which already-ingested tender a downloaded document belongs to.
 *
 * Extracted from scripts/analyze-batch.ts (2026-09-11) so the local batch
 * tool (lib/ingestion/analyze-local-folder.ts) matches documents exactly the
 * way the CLI does. Two copies of this would drift, and a document silently
 * filed against the wrong tender is worse than one that fails to match.
 *
 * Matching is against real, already-known `tenders.tender_number` values
 * rather than a guessed per-source regex shape — see analyze-batch.ts's own
 * header for the PEMEX and CFE numbers that broke the regex approach.
 *
 * A TENDER NUMBER IS NOT UNIQUE, and this file used to assume it was
 * (fixed 2026-09-18). A Colombian `referencia_del_proceso` is an
 * ENTITY-LOCAL sequence: every municipality issues its own LP-001-2026,
 * LP-002-2026, LP-006-2026. That is the same fact that produced the slug
 * collisions fixed on 2026-09-12 (colombia-mapper.ts's buildSecopSlug) —
 * but the slug fix made the two projects two separate rows, which is
 * exactly when this file started picking between them. Two real Colombian
 * projects both numbered LP-006-2026 — Samacá, Boyacá and Ayapel, Córdoba —
 * were reported by the user, one municipality's analysis written onto the
 * other's page.
 *
 * Two separate defects, both silent:
 *
 *   1. loadKnownTenders() keyed a Map by tender number, so the second row
 *      read OVERWROTE the first. Only one of the two ever reached the
 *      matcher, and which one depended on Supabase's row order — which is
 *      unspecified without an ORDER BY. The document then resolved to a
 *      single confident-looking answer with no hint a coin had been flipped.
 *   2. The regex fallback's `.eq("tender_number", …).maybeSingle()` returns
 *      an ERROR (PGRST116) when two rows match, and the error was discarded
 *      — so a duplicated number reported "no ingested tender has it", which
 *      is the one thing that was definitely not true.
 *
 * So: every tender sharing a number is kept, and a number that names more
 * than one tender is resolved by EVIDENCE FROM THE DOCUMENT ITSELF (the
 * buyer's own name — see chooseAmongCandidates) or not at all. Abstaining
 * costs a rename; guessing costs a wrong page, and nothing in either the
 * batch report or the tender page would say so.
 *
 * Deliberately NOT resolved by "prefer the newest tender". It would have
 * fixed the reported case, because an operator is usually analysing
 * something current — and it would silently misfile every document that
 * belongs to the older of the two, which is the same failure this change
 * exists to remove.
 */
import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderRelevanceTier } from "@/types/tender";
import { extractDocumentText, intakeDocument } from "@/lib/ingestion/document-intake";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

export function findDocuments(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && SUPPORTED_EXTENSIONS.includes(extname(path).toLowerCase()))
    .sort();
}

export type ResolvedTender = { slug: string; title: string; buyer: string; tenderNumber: string; tier: TenderRelevanceTier | null; matchNote: string; publicationDate?: string | null };
export type KnownTender = {
  slug: string;
  title: string;
  buyer: string;
  tier: TenderRelevanceTier | null;
  /**
   * Carried only so the ambiguity report can show WHICH of two identically
   * numbered projects is the recent one. The operator reading that line is
   * looking at one of them in the admin list and needs to recognise it; a
   * pair of slugs alone does not tell them apart at a glance.
   */
  publicationDate: string | null;
};

/** The column list every read in this file shares, so a field added for one path cannot go missing on another. */
const TENDER_COLUMNS = "slug, tender_number, title, buyer, relevance_tier, publication_date";

type TenderRow = Record<string, unknown>;

function toKnownTender(row: TenderRow): KnownTender {
  return {
    slug: row.slug as string,
    title: (row.title as { zh: string }).zh,
    buyer: (row.buyer as string) ?? "",
    tier: (row.relevance_tier as TenderRelevanceTier | null) ?? null,
    publicationDate: (row.publication_date as string | null) ?? null,
  };
}

/** A recognized `<slug>__` file name prefix (e.g. `dof-5678901__bases.pdf`) looks the tender up directly by slug — see this file's header comment for the (currently theoretical) case that needs this instead of text matching. */
const SLUG_OVERRIDE_PATTERN = /^([a-z0-9-]+)__/;

/**
 * Groups rows by tender number — EVERY tender that carries a number, not
 * one per number.
 *
 * Pure, and exported, because this is where the bug in the header lived and
 * a live Supabase read is not a place to pin it down. The old version was a
 * `Map<string, KnownTender>`; a second row with the same number overwrote
 * the first, and nothing downstream could tell the difference between "one
 * tender has this number" and "one of two tenders was thrown away here".
 */
export function indexKnownTenders(rows: TenderRow[]): Map<string, KnownTender[]> {
  const known = new Map<string, KnownTender[]>();
  for (const row of rows) {
    const tenderNumber = (row.tender_number as string | null)?.trim();
    if (!tenderNumber) continue;
    const key = tenderNumber.toUpperCase();
    const group = known.get(key);
    if (group) group.push(toKnownTender(row));
    else known.set(key, [toKnownTender(row)]);
  }
  return known;
}

/**
 * Every real tender_number currently in Supabase, fetched once per run —
 * this is the "known facts" a document's own text/file name gets checked
 * against, rather than a guessed regex shape (see header comment). Paged
 * via `.range()` since a real production count can exceed PostgREST's
 * 1000-row default cap (the PEMEX ingest alone kept 3,128 real rows).
 *
 * Ordered by slug so the pages cannot overlap or skip rows. PostgREST's
 * row order is unspecified without an ORDER BY, and `.range()` paging over
 * an unspecified order is how a tender goes missing from "every real
 * tender_number" without anything reporting a failure.
 */
export async function loadKnownTenders(supabase: SupabaseClient): Promise<Map<string, KnownTender[]>> {
  const rows: TenderRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("tenders").select(TENDER_COLUMNS).order("slug", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load known tender numbers: ${error.message}`);
    rows.push(...((data ?? []) as TenderRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return indexKnownTenders(rows);
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^A-Z0-9]+/g;

/**
 * Uppercased, accent-stripped, punctuation collapsed to single spaces, and
 * padded with one space at each end — so `includes(" SAMACA ")` is a whole-word
 * test rather than a substring hit inside a longer word.
 *
 * Accents have to go because the same municipality is "SAMACÁ" in the record
 * and routinely "SAMACA" in the PDF's own body text (and vice versa); a
 * comparison that only matches when both spell it the same way abstains on
 * documents it could have resolved.
 *
 * Deliberately NOT used for the tender-number match below, which needs the
 * hyphens in `LP-006-2026` left alone.
 */
export function toWordHaystack(text: string): string {
  return ` ${text.normalize("NFD").replace(COMBINING_MARKS, "").toUpperCase().replace(NON_ALPHANUMERIC, " ").trim()} `;
}

/**
 * Alphanumerics only, uppercased — every separator gone, not collapsed to a
 * space like toWordHaystack does.
 *
 * This exists for ONE job: recognising a tender number in a file name that
 * an operating system rewrote. `05639268000191-1-000015/2026` is a real
 * Brazilian numeroControlePNCP, and Windows forbids `/` in a file name, so
 * saving that document produces `05639268000191-1-0000152026` — the exact
 * substring test below cannot see the number any more, and neither can the
 * Compras MX-shaped regex fallback, so the document is skipped. Browsers
 * and ZIP tools substitute `_`, `-` or nothing for the same character with
 * no agreement between them, so matching on any one substitution would fix
 * one tool and miss the next.
 */
export function squashSeparators(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/**
 * How many alphanumerics a number needs before it may be matched with its
 * separators removed.
 *
 * Squashing throws away information, and a short mostly-numeric key is
 * where that becomes dangerous: `LP-006-2026` squashes to `LP0062026`, and
 * a file name is full of digit runs (dates, counters, a CNPJ) that could
 * contain it by accident. A Brazilian numeroControlePNCP squashes to 25
 * characters and a Compras MX procedure number to 24 — both far past any
 * plausible coincidence — so the pass covers the numbers that actually get
 * mangled while leaving the short ones on the exact test alone.
 *
 * 12 is also where `CVC LP 008 2026` lands, the real Colombian number
 * (stored WITH spaces) whose document went unmatched on 2026-09-16.
 */
const MIN_SQUASHED_NUMBER_LENGTH = 12;

/**
 * The separator-insensitive pass: run only when the exact test has already
 * failed, and only against the FILE NAME.
 *
 * Not against the document text. Squashing a 50-page pliego yields one
 * unbroken alphanumeric run in which page numbers, table cells and dates
 * sit directly against each other, inventing adjacencies the document never
 * contained. A file name is short, deliberate, and the only place the
 * mangling this fixes actually happens.
 *
 * Abstains when two DIFFERENT numbers match — same rule as
 * chooseAmongCandidates. A number nested inside a longer match is not a
 * second answer, so it is dropped rather than counted; two unrelated ones
 * are a question this cannot answer.
 */
export function matchNumberInMangledFileName(
  fileName: string,
  knownNumbers: Iterable<string>,
): { number: string } | { ambiguous: string[] } | null {
  const squashedName = squashSeparators(fileName);
  const hits = [...knownNumbers].filter((number) => {
    const squashed = squashSeparators(number);
    return squashed.length >= MIN_SQUASHED_NUMBER_LENGTH && squashedName.includes(squashed);
  });
  const distinct = hits.filter(
    (number) =>
      !hits.some(
        (other) =>
          other !== number &&
          squashSeparators(other).length > squashSeparators(number).length &&
          squashSeparators(other).includes(squashSeparators(number)),
      ),
  );
  if (distinct.length === 1) return { number: distinct[0] };
  if (distinct.length > 1) return { ambiguous: distinct.sort() };
  return null;
}

/**
 * Four, so "DE", "DEL", "LA", "Y" and friends never count as evidence. They
 * are usually shared between two Colombian entity names anyway and dropped
 * as non-distinguishing — but not always, and a match on "DE" would be the
 * kind of evidence that is worse than none.
 */
const MIN_EVIDENCE_TOKEN_LENGTH = 4;

function buyerTokens(buyer: string): Set<string> {
  return new Set(toWordHaystack(buyer).trim().split(" ").filter((token) => token.length >= MIN_EVIDENCE_TOKEN_LENGTH));
}

export type CandidateChoice =
  /** `evidence` is empty when there was only ever one candidate — nothing had to be told apart. */
  | { tender: KnownTender; evidence: string[] }
  | { ambiguous: KnownTender[] };

/**
 * Picks between tenders that share a number, using the only witness
 * available: the document's own text.
 *
 * The test is the buyer's name, and only the parts of it that actually
 * DISTINGUISH the candidates. "MUNICIPIO DE SAMACÁ" and "MUNICIPIO DE
 * AYAPEL" share MUNICIPIO; SAMACA and AYAPEL are what separate them, and a
 * pliego names its own municipality many times over. Scoring on the whole
 * name instead would have both candidates matching on the shared words and
 * would turn a reliable signal into a near-tie.
 *
 * Resolves ONLY when exactly one candidate has evidence and the others have
 * none. Two candidates both named in the document (an inter-municipal
 * agreement, a document that quotes a neighbouring process) is not a weaker
 * match to be broken by a score — it is a question this function cannot
 * answer, and it says so.
 */
export function chooseAmongCandidates(candidates: KnownTender[], documentText: string): CandidateChoice {
  if (candidates.length === 1) return { tender: candidates[0], evidence: [] };

  const tokenSets = candidates.map((candidate) => buyerTokens(candidate.buyer));
  const shared = new Set<string>();
  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      for (const token of tokenSets[i]) if (tokenSets[j].has(token)) shared.add(token);
    }
  }

  const haystack = toWordHaystack(documentText);
  const supported = candidates
    .map((candidate, i) => ({
      candidate,
      evidence: [...tokenSets[i]].filter((token) => !shared.has(token) && haystack.includes(` ${token} `)).sort(),
    }))
    .filter((entry) => entry.evidence.length > 0);

  if (supported.length === 1) return { tender: supported[0].candidate, evidence: supported[0].evidence };
  return { ambiguous: candidates };
}

/**
 * The skip line for a number that names more than one tender.
 *
 * It has to carry enough for the operator to act without opening the
 * database: which projects collided, which one is recent, and the one
 * rename that settles it for good. The `<slug>__` prefix is an exact
 * lookup that never reaches this code path — and it is already the shape
 * /admin/documents-needed's ZIP download names its files.
 */
export function describeAmbiguity(fileName: string, tenderNumber: string, candidates: KnownTender[]): string {
  const lines = candidates
    .map((candidate) => `      ${candidate.slug}（${candidate.publicationDate?.slice(0, 10) ?? "无发布日期"}）${candidate.buyer}`)
    .sort()
    .join("\n");
  return [
    `${fileName} — 招标编号 ${tenderNumber} 同时属于 ${candidates.length} 个不同项目，` + `文件里也没有出现能区分它们的采购单位名称，` + `已跳过（没有分析、没有计费、没有改动任何项目）：`,
    lines,
    `      把文件改名成「<项目slug>__${fileName}」再跑一次就能定位到指定项目。`,
  ].join("\n");
}

export async function resolveTender(
  supabase: SupabaseClient,
  pdfPath: string,
  knownTenders: Map<string, KnownTender[]>,
): Promise<{ tender: ResolvedTender } | { skip: string }> {
  const fileName = basename(pdfPath);
  const slugOverride = fileName.match(SLUG_OVERRIDE_PATTERN)?.[1];

  // A file whose whole name IS a slug, with no `__` suffix, is the same
  // assertion written the obvious way — and it is what people actually do
  // when they save a document out of the admin list, which names the file
  // after the tender. Two real misses on 2026-09-16 were exactly this:
  // `secop-890399002-cvc-lp-008-2026.pdf`, whose tender is in the database
  // but whose tender_number is written `CVC LP 008 2026` with spaces, so the
  // text match could never see it in a hyphenated file name.
  //
  // Unlike the `__` form this one FALLS THROUGH when the slug is unknown,
  // rather than reporting it as the reason: a stem that merely looks
  // slug-shaped may be a coincidence, and the text match deserves its turn.
  const stem = basename(pdfPath, extname(pdfPath));
  const slugCandidate = slugOverride ?? (/^[a-z0-9][a-z0-9-]*$/.test(stem) ? stem : undefined);

  if (slugCandidate) {
    const { data } = await supabase.from("tenders").select(TENDER_COLUMNS).eq("slug", slugCandidate).maybeSingle();
    if (!data && slugOverride) return { skip: `${fileName} — filename names slug "${slugOverride}" but no tender in Supabase has it` };
    if (data) {
      // The one unambiguous path: a slug names exactly one tender by
      // definition, which is why the ambiguity report below tells the
      // operator to come back through here.
      const row = data as TenderRow;
      return {
        tender: {
          ...toKnownTender(row),
          tenderNumber: row.tender_number as string,
          matchNote: slugOverride ? `filename slug override (${slugOverride})` : `file name is the tender slug (${slugCandidate})`,
        },
      };
    }
  }

  // Check the file name first (cheap, and a human-chosen name is
  // higher-confidence than a regex frequency count), then the document's
  // own extracted text. Prefer the LONGEST matching known number if more
  // than one appears — a document naming its own procedure plus a couple
  // of others it references should still resolve to its own.
  const text = await extractDocumentText(pdfPath);
  const haystack = `${fileName}\n${text}`.toUpperCase();
  let bestMatch: string | undefined;
  for (const tenderNumber of knownTenders.keys()) {
    if (haystack.includes(tenderNumber) && (!bestMatch || tenderNumber.length > bestMatch.length)) bestMatch = tenderNumber;
  }

  // Nothing matched literally — try the file name again with its
  // separators removed, in case the one in the tender number is a
  // character the operator's file system would not store. See
  // squashSeparators().
  let numberWasMangled = false;
  if (!bestMatch) {
    const mangled = matchNumberInMangledFileName(fileName, knownTenders.keys());
    if (mangled && "ambiguous" in mangled) {
      return {
        skip: `${fileName} — 文件名去掉分隔符后同时命中 ${mangled.ambiguous.length} 个招标编号（${mangled.ambiguous.join("、")}），无法判断属于哪个项目，已跳过（没有分析、没有计费、没有改动任何项目）。把文件改名成「<项目slug>.pdf」可以直接定位。`,
      };
    }
    if (mangled) {
      bestMatch = mangled.number;
      numberWasMangled = true;
    }
  }

  if (bestMatch) {
    // A number can name more than one tender — see the header. Which one
    // this document belongs to is decided by the document, or by nobody.
    const candidates = knownTenders.get(bestMatch)!;
    const choice = chooseAmongCandidates(candidates, haystack);
    if ("ambiguous" in choice) return { skip: describeAmbiguity(fileName, bestMatch, choice.ambiguous) };
    return {
      tender: {
        ...choice.tender,
        tenderNumber: bestMatch,
        matchNote:
          choice.evidence.length > 0
            ? `matched known tender_number ${bestMatch}${numberWasMangled ? " (file name had its separators stripped)" : ""}; ${candidates.length} tenders share it, resolved by buyer name in the document (${choice.evidence.join(", ")})`
            : numberWasMangled
              ? `matched known tender_number ${bestMatch} in the file name, ignoring separators the file system could not store`
              : `matched known tender_number ${bestMatch} in file name/text`,
      },
    };
  }

  // Fall back to the old Compras MX-shaped regex extraction — still useful
  // for a document whose tender genuinely isn't in Supabase yet, or a
  // shape the known-numbers check happened to miss (e.g. OCR noise).
  const intake = await intakeDocument(pdfPath);
  if (!intake.tenderNumber) {
    return {
      skip: `${fileName} — no known tender_number found in its file name/text, and no Compras MX-shaped procedure number either (rename it to the tender slug — "<slug>.pdf" or "<slug>__something.pdf" — if you know which tender it belongs to)`,
    };
  }
  // NOT `.maybeSingle()`: two rows make PostgREST return an error rather
  // than a row, and this call used to discard it — so a duplicated number
  // reported "no ingested tender has it" about a number two ingested
  // tenders were holding.
  const { data, error } = await supabase.from("tenders").select(TENDER_COLUMNS).eq("tender_number", intake.tenderNumber);
  if (error) return { skip: `${fileName} — extracted procedure number ${intake.tenderNumber}, but reading it back failed: ${error.message}` };
  const rows = (data ?? []) as TenderRow[];
  if (rows.length === 0) return { skip: `${fileName} — extracted procedure number ${intake.tenderNumber}, but no ingested tender has it` };

  const choice = chooseAmongCandidates(rows.map(toKnownTender), haystack);
  if ("ambiguous" in choice) return { skip: describeAmbiguity(fileName, intake.tenderNumber, choice.ambiguous) };

  const source =
    intake.tenderNumberSource === "filename" ? "procedure number from file name (regex fallback)" : `procedure number appears ${intake.tenderNumberOccurrences}x in the text (regex fallback)`;
  return {
    tender: {
      ...choice.tender,
      tenderNumber: intake.tenderNumber,
      matchNote: choice.evidence.length > 0 ? `${source}; ${rows.length} tenders share it, resolved by buyer name in the document (${choice.evidence.join(", ")})` : source,
    },
  };
}
