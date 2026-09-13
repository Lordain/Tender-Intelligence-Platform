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

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
