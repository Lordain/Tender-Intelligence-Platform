/**
 * Mercado Público's search export and search fragment → plain rows.
 *
 * Pure. No network, no Supabase, no clock. Everything here is pinned to bytes
 * really served on 2026-09-24 and captured by `npm run capture:chile-busca`;
 * nothing in this file was derived from a selector that looked right.
 *
 * Split out from the mapper because the two fail differently and want to be
 * testable apart: a markup change breaks the parser and a schema change breaks
 * the mapper, and telling those apart on the day it happens is worth a file
 * boundary.
 */

/** The 11 columns, in order, exactly as the export's header row names them. */
export const CHILE_BUSCA_CSV_COLUMNS = [
  "IDLicitacion",
  "NombreLicitacion",
  "Tipo",
  "Estado",
  "FechaPublicacion",
  "Descripcion",
  "Moneda",
  "TipoPresupuesto",
  "TipoMonto",
  "MontoLicitacion",
  "Organismo",
] as const;

export type ChileBuscaRow = {
  /** `NNNN-NN-<Tipo><YY>`, e.g. `2446-256-B226`. The join key — see chile-busca-mapper. */
  id: string;
  title: string;
  /** `LE` / `LP` / `L1` / `LR` / `O1` / `CO` / `B2` / `I2` / `E2` — and always the last-but-two characters of `id`. */
  tipo: string;
  /** The human estado text. `Publicada y disponible para ofertar` for everything this importer asks for. */
  estado: string;
  /** `dd/mm/yyyy HH:MM:SS`, Chile local time. */
  fechaPublicacion: string;
  descripcion: string;
  moneda: string;
  /** `PUBLICADO` or `NO PUBLICADO` — and it decides what `montoLicitacion` even IS. */
  tipoPresupuesto: string;
  /** `DISPONIBLE` / `ESTIMADO` / `NO ES POSIBLE DE ESTIMAR` */
  tipoMonto: string;
  /** Raw, unparsed. A number OR a UTM bracket phrase. See parseChileBuscaAmount(). */
  montoLicitacion: string;
  organismo: string;
};

export class ChileBuscaParseError extends Error {}

/**
 * The export CSV → rows.
 *
 * ── Why a split on `;` is honest here, and where the guard is ─────────────
 *
 * This is a hand-rolled split rather than a real CSV reader, and that is a
 * measurement rather than a shortcut. Over 4,055 rows served on 2026-09-24:
 * zero `"` characters in the entire file, zero bare LFs, and every data row
 * exactly 11 fields — the server strips its own delimiters out of
 * `NombreLicitacion` and `Descripcion` before writing them. There is no
 * quoting convention to honour because there is no quoting.
 *
 * But "4,055 rows had no embedded delimiter" is not "no row ever will", and
 * the failure mode if one does is the bad kind: a split would put the
 * description's tail into `Moneda` and shift every column after it, producing
 * a complete-looking row with a wrong buyer and a wrong amount. So a row whose
 * field count is not 11 is REPORTED, never silently dropped and never
 * silently realigned. `malformed` is returned alongside the rows so a caller
 * can print a number instead of losing rows invisibly.
 *
 * The header is verified by name, not by position or count. If ChileCompra
 * reorders or renames a column, that is the sentence a reader needs to see —
 * not eleven mismatched fields.
 */
export function parseChileBuscaCsv(csvText: string): { rows: ChileBuscaRow[]; malformed: { line: number; fields: number; text: string }[] } {
  const csv = csvText.replace(/^﻿/, "");
  const lines = csv.split("\r\n").filter((line) => line.length > 0);
  if (lines.length === 0) throw new ChileBuscaParseError("智利导出 CSV：空文件（连表头都没有）。");

  const header = lines[0].split(";").map((name) => name.trim());
  if (header.length !== CHILE_BUSCA_CSV_COLUMNS.length || header.some((name, i) => name !== CHILE_BUSCA_CSV_COLUMNS[i])) {
    throw new ChileBuscaParseError(
      "智利导出 CSV：表头和量到的 11 列对不上，说明对方改了导出格式，映射不能再按位置读。\n" +
        `  期望：${CHILE_BUSCA_CSV_COLUMNS.join(";")}\n` +
        `  实际：${header.join(";")}`,
    );
  }

  const rows: ChileBuscaRow[] = [];
  const malformed: { line: number; fields: number; text: string }[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const f = line.split(";");
    if (f.length !== CHILE_BUSCA_CSV_COLUMNS.length) {
      malformed.push({ line: index + 2, fields: f.length, text: line.slice(0, 200) });
      continue;
    }
    rows.push({
      id: f[0].trim(),
      title: f[1].trim(),
      tipo: f[2].trim(),
      estado: f[3].trim(),
      fechaPublicacion: f[4].trim(),
      descripcion: f[5].trim(),
      moneda: f[6].trim(),
      tipoPresupuesto: f[7].trim(),
      tipoMonto: f[8].trim(),
      montoLicitacion: f[9].trim(),
      // Trimmed because 2 of 4,055 arrived with surrounding whitespace, and an
      // untrimmed buyer name becomes its own facet value on the list page —
      // the same bug the OCDS mapper's region trim exists for.
      organismo: f[10].trim(),
    });
  }
  return { rows, malformed };
}

/**
 * `dd/mm/yyyy HH:MM:SS` (or bare `dd/mm/yyyy`) → a bare `YYYY-MM-DD`.
 *
 * ── Why a calendar day and not an instant ─────────────────────────────────
 *
 * Two reasons, and the second one is a bug that was caught by a test rather
 * than reasoned about.
 *
 * First, a calendar day is what this source actually publishes. The closing
 * date on the HTML card is `29/09/2026` with no time and no zone at all, and
 * the site renders it next to its own "En 5 días". Chile is UTC−3 in summer
 * and UTC−4 in winter, and its DST dates move by decree — so attaching any
 * offset here would be inventing precision the source never gave us, and
 * getting it wrong for half the year.
 *
 * Second: emitting `…T00:00:00.000Z` instead is actively WRONG in this
 * codebase, not merely imprecise. `platformDay()` passes a bare `YYYY-MM-DD`
 * through untouched but converts an instant into the platform's business
 * timezone, which is UTC−6 — so UTC midnight becomes 18:00 the PREVIOUS day,
 * and a tender closing today reads as having closed yesterday. That is
 * precisely the off-by-one `platformDay()`'s own comment was written about,
 * after it cost two live rules a day each. Written the first way here; a test
 * ("当天截止仍算 open") caught it.
 *
 * `dd/mm/yyyy`, never `mm/dd/yyyy`. The distinction is unfalsifiable on a
 * value like 03/04/2026, so it is pinned by 24/09/2026 and 01/12/2026 in the
 * tests instead.
 *
 * Returns undefined rather than an Invalid Date, so a caller cannot write
 * "Invalid Date" into a row.
 */
export function parseChileBuscaDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Round-tripped so an impossible calendar day (31/02) is rejected rather
  // than silently rolling forward into March.
  const probe = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== day || probe.getUTCMonth() + 1 !== month || probe.getUTCFullYear() !== year) {
    return undefined;
  }
  return `${yyyy}-${mm}-${dd}`;
}

export type ChileBuscaAmount =
  | { kind: "number"; amount: number }
  /** The amount is not published; what we have is a UTM size band, verbatim. */
  | { kind: "band"; band: string }
  | { kind: "none" };

/**
 * `MontoLicitacion` → a number, a band, or nothing.
 *
 * ── The column is polymorphic, and that is the trap ───────────────────────
 *
 * Measured over 4,055 rows on 2026-09-24, `MontoLicitacion` holds one of two
 * completely different kinds of thing, and `TipoPresupuesto` says which:
 *
 *   PUBLICADO      2,247 rows   a number: "100.933.572", "70.063,00"
 *   NO PUBLICADO   1,808 rows   a phrase: "Entre 100 y 1000 UTM", "Menor a 100 UTM",
 *                               "Igual o superior a 5.000 UTM", "No público", …
 *
 * The counts line up exactly with the `TipoPresupuesto` split, so the rule is
 * clean rather than approximate. Nine distinct phrases appeared, and they are
 * not even internally consistent about their own numbers ("Entre 100 y 1000
 * UTM" and "Igual o superior a 100 UTM e inferior a 1000 UTM" describe the
 * same band; "1000 UTM" and "1.000 UTM" both appear). Nothing here parses
 * them into numbers: that would need the UTM-to-peso rate, which this machine
 * cannot reach, and it is the same refusal round 2 made about the CLP rate.
 * The band is carried through as text so a human can read it.
 *
 * A naive `Number(raw.replace(/\./g, ""))` on this column does not throw — it
 * returns NaN for most phrases, but for "Igual o superior a 5.000 UTM" a
 * digit-scraping variant would cheerfully produce 5000, and 5,000 pesos would
 * then be classified as a trivially small tender. This function never guesses
 * a number out of a phrase.
 *
 * Number format is es-CL: `.` groups thousands, `,` is the decimal separator.
 * Both appear (CLP amounts are whole; USD ones carry ",00").
 */
export function parseChileBuscaAmount(raw: string, tipoPresupuesto: string): ChileBuscaAmount {
  const value = raw.trim();
  if (!value) return { kind: "none" };
  // Decided by the declared type, not by "does it look numeric". A phrase that
  // happened to be all digits would otherwise silently become money.
  if (tipoPresupuesto.trim().toUpperCase() !== "PUBLICADO") return { kind: "band", band: value };
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(value)) return { kind: "band", band: value };
  const amount = Number(value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { kind: "none" };
  return { kind: "number", amount };
}

/** One card off the HTML fragment. Only what was measured present on 120 of 120 cards. */
export type ChileBuscaCard = {
  id: string;
  /** `dd/mm/yyyy`. THE reason the HTML is read at all — the CSV has no closing date. */
  fechaCierre?: string;
  /** e.g. "En 5 días" / "Cerrada". The site's own words, carried verbatim rather than recomputed. */
  cierreTexto?: string;
  fechaPublicacion?: string;
  /** The buying unit under the organismo — the CSV has only the organismo. */
  unidad?: string;
  /** `Cantidad de compras efectuadas*` — a buyer-reliability counter OCDS does not have. */
  comprasEfectuadas?: number;
  /** `Cantidad de reclamos por pago no oportuno*` — how often this buyer was reported for paying late. */
  reclamosPagoNoOportuno?: number;
};

/**
 * Splits the fragment into cards on the one marker that carries meaning.
 *
 * `lic-bloq-wrap` is the result-block class the server emits per tender, and
 * it is followed by a status-derived class ("licitacion-publicada y disponible
 * para ofertar sombra_hover"), so the split is on the prefix only.
 *
 * Deliberately NOT split on `col-md-4`, `row`, `margin-bottom-md` or any other
 * Bootstrap grid class: those are layout, they appear several times inside a
 * single card, and they are exactly what a redesign changes first. See the
 * README's fragility note.
 */
export function splitChileBuscaCards(html: string): string[] {
  return html.split(/<div class="lic-bloq-wrap /).slice(1);
}

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The fragment is served with numeric entities for every accented character (`Regi&#243;n`). */
export function decodeChileBuscaText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
}

const asCount = (raw: string | undefined): number | undefined => {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
};

/**
 * One card → the fields the CSV does not carry.
 *
 * Every extraction below is anchored on a `<strong>` LABEL the page shows a
 * human ("Fecha de cierre", "Cantidad de compras") or on a semantic class
 * (`id-licitacion`, `lic-bloq-footer`) — never on grid position. The two
 * date cells are told apart by their labels rather than by being the second
 * and third `col-md-4` in a row, because they are only reliably distinguished
 * by what they say: the closing-date cell is conditionally rendered and its
 * position moves.
 *
 * Note what is NOT extracted: the amount. It is on the card, but the label
 * ("Monto disponible" / "Monto estimado") is the only thing distinguishing the
 * two kinds — the CSS class is `monto-dis` on 120 of 120 cards, estimado ones
 * included. The CSV carries the same number in a typed pair of columns, so the
 * amount is read there and this parser does not compete with it.
 */
export function parseChileBuscaCard(card: string): ChileBuscaCard | null {
  const id = decodeChileBuscaText(/<div class="col-sm-6 id-licitacion">[\s\S]*?<span class="clearfix">([^<]*)<\/span>/.exec(card)?.[1] ?? "");
  if (!id) return null;

  const result: ChileBuscaCard = { id };
  for (const match of card.matchAll(/<p><strong>(Fecha de [^<]*)<\/strong><\/p><span[^>]*>([^<]*)<\/span>/g)) {
    const label = decodeChileBuscaText(match[1]);
    const value = decodeChileBuscaText(match[2]);
    if (!value) continue;
    if (/cierre/i.test(label)) result.fechaCierre = value;
    else if (/publicaci/i.test(label)) result.fechaPublicacion = value;
  }
  const hint = /Fecha de cierre<\/strong><\/p><span[^>]*>[^<]*<\/span>\s*<span>\(([^)]*)\)/.exec(card)?.[1];
  if (hint) result.cierreTexto = decodeChileBuscaText(hint);

  const footer = /<div class="lic-bloq-footer">([\s\S]*)$/.exec(card)?.[1] ?? "";
  const unidad = decodeChileBuscaText(/<strong>[\s\S]*?<\/strong><br \/><p>([\s\S]*?)<\/p>/.exec(footer)?.[1] ?? "");
  if (unidad) result.unidad = unidad;

  const compras = asCount(decodeChileBuscaText(/Cantidad de compras[\s\S]{0,80}?<\/strong><\/p><span[^>]*>([^<]*)<\/span>/.exec(footer)?.[1] ?? ""));
  if (compras !== undefined) result.comprasEfectuadas = compras;
  const reclamos = asCount(decodeChileBuscaText(/Cantidad de reclamos[\s\S]{0,90}?<\/strong><\/p><span[^>]*>([^<]*)<\/span>/.exec(footer)?.[1] ?? ""));
  if (reclamos !== undefined) result.reclamosPagoNoOportuno = reclamos;

  return result;
}

/**
 * The whole fragment → a card per tender.
 *
 * Throws on a fragment that produced no cards at all, rather than returning
 * an empty list. An empty list is indistinguishable from "this page is past
 * the end", and on this door the difference between "no results" and "the
 * markup changed and we now match nothing" is the difference between a quiet
 * day and a silently broken importer.
 */
export function parseChileBuscaSearchHtml(html: string): ChileBuscaCard[] {
  const cards = splitChileBuscaCards(html).map(parseChileBuscaCard).filter((card): card is ChileBuscaCard => card !== null);
  if (cards.length === 0 && /lic-bloq-wrap/.test(html)) {
    throw new ChileBuscaParseError(
      "智利搜索页：正文里有 lic-bloq-wrap 结果块，但一条都没解析出来 —— 说明对方改了卡片内部的标记，解析器该重抓 fixture 了。\n" +
        "  这跟「这一页没有结果」不是一回事，所以这里抛错而不是返回空数组。",
    );
  }
  return cards;
}

/** The total the fragment's own hidden inputs claim. Drifts minute to minute — this is a live feed — so it is a sanity number, not a paging bound. */
export function chileBuscaDeclaredTotals(html: string): { publico?: number; privado?: number } {
  const read = (id: string) => {
    const match = new RegExp(`id="${id}"[^>]*value="(\\d+)"`).exec(html);
    return match ? Number(match[1]) : undefined;
  };
  return { publico: read("hdnTotalPresupuestoPublico"), privado: read("hdnTotalPresupuestoPrivado") };
}
