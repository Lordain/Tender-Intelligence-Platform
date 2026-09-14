import type { ExtractedKeyDateType } from "@/lib/ingestion/key-date-checks";

/**
 * Parses a SEACE *ficha de selección* Cronograma table, pasted in by an
 * admin from their own browser.
 *
 * Why this exists rather than a connector: the bid deadline for a Peru
 * tender is published in exactly one place — the ficha HTML page — and
 * that page is keyed by a UUID that appears NOWHERE in the OCDS record
 * (confirmed 2026-09-14: the record's only UUID is a document download
 * fileCode, `5da1ea91-…`, while the ficha for the same tender is
 * `…fichaSeleccion.xhtml?id=5aeb5f38-…`). The URL cannot be constructed
 * from the data, so reaching it means driving SEACE's own search — the
 * part this project does not automate, by standing policy. A person
 * already has the page open; copying its table is the honest path, and it
 * costs no model call, no request to SEACE, and produces exact published
 * dates rather than an inference.
 *
 * What it must survive, all real properties of that table:
 *
 * - **Two date columns.** "Fecha Inicio" and "Fecha Fin". For a window
 *   (Registro de participantes, Consultas, Presentación de propuestas)
 *   the deadline is the END — 13/10/2026 00:01 → 13/10/2026 23:59 is one
 *   day, but 11/09 → 12/10 is a month, and taking the start there would
 *   move a deadline a month early.
 * - **DD/MM/YYYY.** 13/10/2026 is 13 October. `new Date()` would read
 *   several of these rows as a different month without complaint, which
 *   is why the dates are split by hand here rather than parsed.
 * - **Times attached to dates.** "11/09/2026 00:01", "14/10/2026 08:30".
 * - **Cells that wrap onto a second line.** "Integración de las Bases" is
 *   followed by the entity's name on its own line. So rows are found by
 *   looking for DATES, not by assuming one row per line: a line with no
 *   date is buffered as more label for the row that follows.
 * - **Stage suffixes.** "(Electronica)" is appended to several stages.
 *
 * Deliberately NOT imported, and reported rather than dropped in silence:
 * Convocatoria (publication_date comes from the feed and is protected by
 * migration 0030 — a pasted table must not overwrite it), and the stages
 * this platform has no key-date type for (Registro de participantes,
 * Integración de las Bases, Calificación y Evaluación). Someone pasting a
 * table needs to see that four of its eight rows were not stored, or they
 * will assume a bug the first time they look.
 */

export type ParsedCronogramaRow = {
  /** The stage exactly as the ficha printed it, for the admin to check against. */
  label: string;
  /** The day this row resolves to, YYYY-MM-DD — the END of a window. */
  date: string;
  type: ExtractedKeyDateType;
  /** The raw cells, so a mis-parse is visible instead of merely wrong. */
  raw: string;
};

export type ParsedCronograma = {
  rows: ParsedCronogramaRow[];
  /** Recognised stages this platform stores no type for, plus Convocatoria. */
  ignored: { label: string; reason: string }[];
  /** Lines that looked like a row but could not be understood at all. */
  unparsed: string[];
};

/** Accent- and case-insensitive, so "Absolución" and "ABSOLUCION" match one rule. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ordered, and the order is load-bearing: "Absolución de consultas y
 * observaciones" contains "consultas y observaciones", so the absolución
 * rule must be tested before the consultas one or a clarification date
 * would be stored as the questions deadline.
 */
const STAGE_RULES: { match: RegExp; type: ExtractedKeyDateType }[] = [
  { match: /absolucion de consultas|absolucion de observaciones/, type: "clarification" },
  { match: /formulacion de consultas|consultas y observaciones/, type: "questions_deadline" },
  { match: /presentacion de (propuestas|ofertas)/, type: "submission" },
  { match: /otorgamiento de la buena pro|buena pro/, type: "award" },
  { match: /suscripcion del contrato|firma del contrato|perfeccionamiento del contrato/, type: "contract_signing" },
  { match: /visita (al sitio|de obra|tecnica)|reconocimiento del lugar/, type: "site_visit" },
  { match: /apertura de (sobres|propuestas|ofertas)/, type: "opening" },
];

const IGNORED_RULES: { match: RegExp; reason: string }[] = [
  { match: /^convocatoria/, reason: "发布日由数据源提供并受保护，不从粘贴内容覆盖" },
  { match: /registro de participantes/, reason: "本平台没有「报名截止」这个日期类型" },
  { match: /integracion de las bases/, reason: "本平台没有「标书整合」这个日期类型" },
  { match: /calificacion y evaluacion/, reason: "本平台没有「资格评审」这个日期类型" },
];

/** DD/MM/YYYY, optionally followed by HH:MM. */
const DATE_TOKEN = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?/g;

function toIsoDay(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Rejects 31/02 and friends rather than letting Date roll them forward.
  return new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseSeaceCronograma(pasted: string): ParsedCronograma {
  const rows: ParsedCronogramaRow[] = [];
  const ignored: { label: string; reason: string }[] = [];
  const unparsed: string[] = [];
  let carriedLabel = "";

  for (const rawLine of pasted.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    DATE_TOKEN.lastIndex = 0;
    const matches = [...line.matchAll(DATE_TOKEN)];
    if (matches.length === 0) {
      // A wrapped cell, or the header row. Header words are dropped; anything
      // else is kept as a prefix for the row whose dates come next.
      const normalized = normalize(line);
      if (!/^(etapa|fecha inicio|fecha fin|cronograma)/.test(normalized)) {
        carriedLabel = carriedLabel ? `${carriedLabel} ${line}` : line;
      }
      continue;
    }

    const label = `${carriedLabel} ${line.slice(0, matches[0].index)}`.replace(/\s+/g, " ").trim();
    carriedLabel = "";
    if (!label) {
      unparsed.push(line);
      continue;
    }

    const normalized = normalize(label);
    const ignoredRule = IGNORED_RULES.find((rule) => rule.match.test(normalized));
    if (ignoredRule) {
      ignored.push({ label, reason: ignoredRule.reason });
      continue;
    }

    const rule = STAGE_RULES.find((entry) => entry.match.test(normalized));
    if (!rule) {
      unparsed.push(line);
      continue;
    }

    // The LAST date on the row: "Fecha Fin" when the stage is a window, and
    // the same value as Fecha Inicio when it is a single day.
    const last = matches[matches.length - 1];
    const date = toIsoDay(last[1], last[2], last[3]);
    if (!date) {
      unparsed.push(line);
      continue;
    }

    rows.push({ label, date, type: rule.type, raw: line });
  }

  return { rows, ignored, unparsed };
}

/** A key date already stored for the tender, as this module needs to see it. */
export type ExistingKeyDate = {
  type: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Where it came from, for telling the admin which row is which. */
  sourceReference?: string | null;
  extractedFromDocument?: boolean;
};

export type CronogramaDiff = {
  /** Rows to actually insert — the ficha rows nothing already covers. */
  toInsert: ParsedCronogramaRow[];
  /** Ficha rows an existing entry already states, to the day. Not re-inserted. */
  duplicates: { row: ParsedCronogramaRow; existingSource: string }[];
  /** Same stage, different day: the one case a person has to settle. */
  conflicts: { row: ParsedCronogramaRow; storedDate: string; existingSource: string }[];
};

function describeSource(existing: ExistingKeyDate): string {
  if (existing.extractedFromDocument) return "标书提取";
  if (existing.sourceReference) return existing.sourceReference;
  return "已有记录";
}

/**
 * Works out what a pasted cronograma actually adds, given what the tender
 * already has.
 *
 * Found the first time this ran on real data (2026-09-14): the tender
 * already carried a `questions_deadline` of 2026-09-21 extracted from its
 * bid document, and the paste wrote a second row for the same day — two
 * identical 提问截止 entries on the admin page, and on the public timeline.
 * The agreement is the good news (it is the first independent confirmation
 * the document extraction of #31 was right), but it is one fact and belongs
 * on one row.
 *
 * The three outcomes are deliberately different:
 *
 * - **Same stage, same day** — the ficha adds nothing, so nothing is
 *   inserted. The existing row stays, notes and all; a model-written
 *   explanation of what the deadline means is worth more to a reader than
 *   the Spanish stage name this would replace it with.
 * - **Same stage, different day** — inserted anyway, and reported loudly.
 *   The ficha is the official page, but a stored row was put there by a
 *   person or a document, and deleting either from here would destroy a
 *   record nobody reviewed. Both rows visible, with the disagreement named,
 *   is the honest state; a human deletes the wrong one.
 * - **New stage** — inserted.
 *
 * Rows this endpoint wrote itself are excluded by the caller before this is
 * called (they are deleted and rebuilt on every paste), so re-pasting the
 * same table is idempotent rather than being reported as conflicting with
 * its own previous run.
 */
export function diffAgainstExisting(
  rows: readonly ParsedCronogramaRow[],
  existing: readonly ExistingKeyDate[],
): CronogramaDiff {
  const diff: CronogramaDiff = { toInsert: [], duplicates: [], conflicts: [] };

  for (const row of rows) {
    const sameType = existing.filter((entry) => entry.type === row.type);
    const sameDay = sameType.find((entry) => entry.date.slice(0, 10) === row.date);
    if (sameDay) {
      diff.duplicates.push({ row, existingSource: describeSource(sameDay) });
      continue;
    }
    const clash = sameType[0];
    if (clash) diff.conflicts.push({ row, storedDate: clash.date.slice(0, 10), existingSource: describeSource(clash) });
    diff.toInsert.push(row);
  }

  return diff;
}
