/**
 * What an import must NOT overwrite on a tender that already exists.
 *
 * buildRowWithProtectedValues() is the only thing standing between a daily
 * re-import and work that cost money or human attention to produce. Every
 * rule it holds was added after something was already lost: hand-corrected
 * fields (migration 0032), a publication date that crept forward every run,
 * and now a machine translation that a re-import silently reset to Spanish.
 *
 * These run with no database — the function is pure over (mapped tender,
 * stored row).
 *
 * Usage: npm run test:upsert-protection
 */
import { buildRowWithProtectedValues, type ExistingRow } from "../lib/ingestion/upsert-tenders";
import { untranslated } from "../lib/ingestion/text-utils";
import type { Tender } from "../types/tender";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
  }
}

/** A freshly mapped tender: title/summary always arrive as the untranslated mirror. */
function mapped(titleEs: string, summaryEs = titleEs): Tender {
  return {
    slug: "secop-test-1",
    tenderNumber: "LP-001-2026",
    title: untranslated(titleEs),
    summary: untranslated(summaryEs),
    buyer: "ENTIDAD DE PRUEBA",
    country: "colombia",
    governmentLevel: "national",
    industries: ["construction"],
    scopeType: "works",
    procedureType: "open",
    publicationDate: "2026-09-01",
    sourceName: "SECOP II",
    sourceUrl: "https://example.com/x",
    relevance: { tier: "standard", label: "标准", reason: "test" },
  } as unknown as Tender;
}

function stored(row: Record<string, unknown>): ExistingRow {
  return { omit: new Set<string>(row.__omit as string[] ?? []), stored: row };
}

const ES = "CONSTRUCCIÓN DE UNA VARIANTE";
const ZH = "修建绕行路段";

// ── The translation survives an ordinary re-import ─────────────────────────
{
  const row = buildRowWithProtectedValues(
    mapped(ES),
    stored({ slug: "secop-test-1", title: { es: ES, en: ES, zh: ZH }, summary: { es: ES, en: ES, zh: ZH } }),
  );
  check("translated title is kept when the Spanish is unchanged", row.title, { es: ES, en: ES, zh: ZH });
  check("translated summary is kept when the Spanish is unchanged", row.summary, { es: ES, en: ES, zh: ZH });
}

// ── A changed source title releases it, so translation re-runs ─────────────
{
  const corrected = `${ES} (CORREGIDO)`;
  const row = buildRowWithProtectedValues(
    mapped(corrected, ES),
    stored({ slug: "secop-test-1", title: { es: ES, en: ES, zh: ZH }, summary: { es: ES, en: ES, zh: ZH } }),
  );
  check("a corrected Spanish title drops the stale translation", row.title, untranslated(corrected));
  check("the untouched summary still keeps its translation", row.summary, { es: ES, en: ES, zh: ZH });
}

// A phase suffix the mapper now strips is the same shape as a corrected title.
{
  const withSuffix = `${ES} (Fase de Selección (Presentación de ofertas))`;
  const row = buildRowWithProtectedValues(
    mapped(ES),
    stored({ slug: "secop-test-1", title: { es: withSuffix, en: withSuffix, zh: `${ZH}（遴选阶段/提交报价）` } }),
  );
  check("a stripped phase suffix drops the translation that carried it", row.title, untranslated(ES));
}

// ── Nothing to keep ────────────────────────────────────────────────────────
{
  const row = buildRowWithProtectedValues(
    mapped(ES),
    stored({ slug: "secop-test-1", title: { es: ES, en: ES, zh: ES } }),
  );
  check("a never-translated row is left as the mapper built it", row.title, untranslated(ES));
}

{
  const row = buildRowWithProtectedValues(mapped(ES), undefined);
  check("a brand-new tender has nothing to preserve", row.title, untranslated(ES));
}

// ── A hand edit still outranks the translation rule ────────────────────────
{
  const handwritten = { es: ES, en: ES, zh: "人工改写的中文标题" };
  const row = buildRowWithProtectedValues(
    mapped(`${ES} (CORREGIDO)`),
    stored({ slug: "secop-test-1", title: handwritten, __omit: ["title"] }),
  );
  check("manual_field_overrides wins even when the Spanish changed", row.title, handwritten);
}

// ── An import may not delete a value by having none ────────────────────────
// The rule that would have prevented 2026-09-15 on its own: ~65 Peru
// deadlines, pasted in by hand from the official SEACE ficha, written to null
// by the next import because Peru's feed publishes no deadline at all. No
// lock was involved — the feed simply had nothing to say and said it anyway.
{
  const withDates = mapped(ES) as Record<string, unknown>;
  const row = buildRowWithProtectedValues(withDates as unknown as Tender, stored({
    slug: "secop-test-1",
    submission_deadline: "2026-10-13",
    award_date: "2026-10-20",
    estimated_value: 1_200_000,
    currency: "PEN",
    awarded_to: "CONSORCIO X",
    structured_duration_days: 240,
  }));
  check("a pasted bid deadline survives an import that carries none", row.submission_deadline, "2026-10-13");
  check("…so does the award date", row.award_date, "2026-10-20");
  check("…and the estimated value with its currency", [row.estimated_value, row.currency], [1_200_000, "PEN"]);
  check("…and the awarded supplier", row.awarded_to, "CONSORCIO X");
  check("…and the stored duration", row.structured_duration_days, 240);
}

{
  // The other direction, which must keep working: a source that DOES publish
  // a date still updates one, lock absent. Nobody may delete a value by
  // having none; anyone may improve it.
  const incoming = { ...mapped(ES), submissionDeadline: "2026-11-01" } as unknown as Tender;
  const row = buildRowWithProtectedValues(incoming, stored({ slug: "secop-test-1", submission_deadline: "2026-10-13" }));
  check("a real date from the source still wins", row.submission_deadline, "2026-11-01");
}

{
  // And a hand edit still outranks even a real source value.
  const incoming = { ...mapped(ES), submissionDeadline: "2026-11-01" } as unknown as Tender;
  const row = buildRowWithProtectedValues(incoming, stored({
    slug: "secop-test-1",
    submission_deadline: "2026-10-13",
    __omit: ["submission_deadline"],
  }));
  check("a locked deadline beats a real source value", row.submission_deadline, "2026-10-13");
}

{
  // A column that was empty stays fillable — the rule must not freeze nulls.
  const incoming = { ...mapped(ES), submissionDeadline: "2026-11-01" } as unknown as Tender;
  const row = buildRowWithProtectedValues(incoming, stored({ slug: "secop-test-1", submission_deadline: null }));
  check("an empty deadline is still filled by the source", row.submission_deadline, "2026-11-01");
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
