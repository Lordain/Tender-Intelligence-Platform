/**
 * Guatecompras pages as the admin copies them (user, 2026-10-16: A —
 * 两步粘贴导入). Guatecompras answers our servers with a Cloudflare challenge,
 * so nothing is fetched: the admin selects the page in their own browser and
 * pastes it. Pure functions; scripts/test-guatemala-paste.ts runs them on
 * the pages pasted on 2026-10-16.
 *
 * The 「Consulta de concursos VIGENTES」 list: after the modality counts and
 * 「Listado de Concurso」, one block per call —
 *
 *   31330665                      NOG
 *   14.oct..2026                  published
 *   26.nov..2026                  offers until (a day, no time)
 *    Público                      type
 *   Vigente                       status
 *   MINISTERIO DE COMUNICACIONES, INFRAESTRUCTURA Y VIVIENDA     entity
 *   DIRECCION GENERAL DE AERONAUTICA CIVIL                       buying unit
 *   Muebles y mobiliario de oficina                              categories (" | " between)
 *   ADQUISICIÓN DE TRACTORES Y CHAPEADORAS …                     description (one line or more)
 *   Licitación Pública (Art. 17 LCE)                             modality
 *
 * A detail page (「Detalle de concurso」) adds the hour, the kind of entity
 * (「Gobiernos Locales」 for a municipality), the bond percentages and
 * whether the work is a registered public investment (「Requiere SNIP」).
 * Neither page states an amount.
 */

/** Guatemala keeps UTC-6 all year. */
const GUATEMALA_OFFSET = "-06:00";

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "16.oct..2026" or "16.octubre.2026", with an optional "08:32:30 a.m."; a bare day is that day's end, or its noon for a publication day. */
export function guatecomprasDate(text: string | undefined, bareDay: "end" | "noon" = "end"): string | undefined {
  const match = /(\d{1,2})\.([a-záéíóú]+)\.+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?)?/i.exec(text ?? "");
  if (!match) return undefined;
  const month = MONTHS[match[2].toLowerCase().slice(0, 3)];
  const day = Number(match[1]);
  if (!month || day < 1 || day > 31) return undefined;
  let hours = bareDay === "noon" ? 12 : 23;
  let minutes = bareDay === "noon" ? 0 : 59;
  if (match[4] !== undefined) {
    hours = Number(match[4]) % 12 + (match[7].toLowerCase() === "p" ? 12 : 0);
    minutes = Number(match[5]);
  }
  return new Date(`${match[3]}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00${GUATEMALA_OFFSET}`).toISOString();
}

const NOG_LINE = /^\d{6,12}$/;
const DAY_LINE = /^\d{1,2}\.[a-záéíóú]+\.+\d{4}$/i;
/** The modality closing a block: "Licitación Pública (Art. 17 LCE)", "… (Decreto 11-2021)", "Sin Modalidad". */
const MODALITY_LINE = /\((?:Art\.?|Artículo|Decreto)[^)]*\)\s*$|^Sin Modalidad$/i;

export type GuatecomprasListCall = {
  nog: string;
  publishedDay?: string;
  offersUntilDay?: string;
  status: string;
  entity: string;
  unit: string;
  categories: string;
  description: string;
  modality: string;
};

export function parseGuatecomprasList(text: string): GuatecomprasListCall[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => /^Listado de Concurso/i.test(line));
  const calls: GuatecomprasListCall[] = [];
  for (let i = Math.max(0, start); i < lines.length; i++) {
    if (!NOG_LINE.test(lines[i]) || !DAY_LINE.test(lines[i + 1] ?? "")) continue;
    let end = i + 1;
    while (end < lines.length && !MODALITY_LINE.test(lines[end]) && !(NOG_LINE.test(lines[end]) && DAY_LINE.test(lines[end + 1] ?? "")) && !/^Ir a la página/i.test(lines[end])) end++;
    if (end >= lines.length || !MODALITY_LINE.test(lines[end])) continue;
    const block = lines.slice(i, end + 1);
    // nog, published, until, type, status, entity, unit, categories, description…, modality
    if (block.length < 10) continue;
    calls.push({
      nog: block[0],
      publishedDay: guatecomprasDate(block[1], "noon"),
      offersUntilDay: DAY_LINE.test(block[2]) ? guatecomprasDate(block[2]) : undefined,
      status: block[4],
      entity: block[5],
      unit: block[6],
      categories: block[7],
      description: block.slice(8, -1).join(" ").replace(/\s+/g, " ").trim(),
      modality: block[block.length - 1],
    });
    i = end;
  }
  return calls;
}

const DETAIL_LABELS = [
  "NOG",
  "Descripción",
  "Modalidad",
  "Categorías",
  "Tipo de concurso",
  "Entidad",
  "Tipo de Entidad",
  "Unidad compradora",
  "Tipo de recepción de ofertas",
  "Fecha de publicación",
  "Fecha de presentación de ofertas",
  "Fecha de cierre de recepción de ofertas",
  "Tipo Proceso",
  "Porcentaje de Fianza de sostenimiento",
  "Porcentaje de Fianza de cumplimiento",
  "Fecha de última adjudicación",
  "Fecha del último cambio de estatus",
  "Estatus",
  "Requiere SNIP",
] as const;
type DetailLabel = (typeof DETAIL_LABELS)[number];
/** Where a detail page's fields end: its tabs and operations. */
const DETAIL_END = /^(Operaciones de concurso|Documentos del Proceso de contratación|Documentos CoST|Tipos de Producto)$/i;

export type GuatecomprasDetail = {
  nog: string;
  description: string;
  modality: string;
  categories: string;
  entity: string;
  entityKind: string;
  unit: string;
  publishedAt?: string;
  /** The earlier of 「presentación」 and 「cierre de recepción」 — when offers must be in. */
  offersUntil?: string;
  status: string;
  bondBidPercent: number | null;
  bondPerformancePercent: number | null;
  snip: boolean;
  /** Offers only through Guatecompras, as every sampled page says. */
  electronicOnly: boolean;
};

function percent(value: string | undefined): number | null {
  const number = Number((value ?? "").replace(",", "."));
  return Number.isFinite(number) && (value ?? "").trim() !== "" ? number : null;
}

/** Every 「Detalle de concurso」 in the text: one paste can hold several pages. */
export function parseGuatecomprasDetails(text: string): GuatecomprasDetail[] {
  const parts = text.split(/^\s*Detalle de concurso\s*$/im).slice(1);
  const details: GuatecomprasDetail[] = [];
  for (const part of parts) {
    const lines = part
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const fields = new Map<DetailLabel, string>();
    let current: DetailLabel | null = null;
    for (const line of lines) {
      if (DETAIL_END.test(line)) break;
      const label = DETAIL_LABELS.find((candidate) => line.toLowerCase() === `${candidate.toLowerCase()}:`);
      if (label) {
        current = label;
        continue;
      }
      if (current) fields.set(current, [fields.get(current), line].filter(Boolean).join(" "));
    }
    const nog = (fields.get("NOG") ?? "").match(/\d{6,12}/)?.[0];
    if (!nog) continue;
    const times = [guatecomprasDate(fields.get("Fecha de presentación de ofertas")), guatecomprasDate(fields.get("Fecha de cierre de recepción de ofertas"))].filter(
      (value): value is string => Boolean(value),
    );
    details.push({
      nog,
      description: (fields.get("Descripción") ?? "").replace(/\s+/g, " ").trim(),
      modality: fields.get("Modalidad") ?? "",
      categories: fields.get("Categorías") ?? "",
      entity: fields.get("Entidad") ?? "",
      entityKind: fields.get("Tipo de Entidad") ?? "",
      unit: fields.get("Unidad compradora") ?? "",
      publishedAt: guatecomprasDate(fields.get("Fecha de publicación")),
      ...(times.length > 0 ? { offersUntil: times.sort()[0] } : {}),
      status: fields.get("Estatus") ?? "",
      bondBidPercent: percent(fields.get("Porcentaje de Fianza de sostenimiento")),
      bondPerformancePercent: percent(fields.get("Porcentaje de Fianza de cumplimiento")),
      snip: /^s[ií]/i.test(fields.get("Requiere SNIP") ?? ""),
      electronicOnly: /electr[oó]nic/i.test(fields.get("Tipo de recepción de ofertas") ?? ""),
    });
  }
  return details;
}

/** The modalities read (user's rule A): public tenders, and calls run under international agreements. */
export function isReadGuatemalaModality(modality: string): boolean {
  return /^Licitaci[oó]n P[uú]blica \(Art\.? ?17/i.test(modality) || /^Convenios y Tratados Internacionales/i.test(modality);
}

/**
 * A local government: the detail page's 「Tipo de Entidad: Gobiernos Locales
 * (Municipalidades, Mancomunidades, etc.)」, or — on the list, which has no
 * kind — a municipality, a mancomunidad or a municipal company by name.
 */
export function isGuatemalaLocalGovernment(entity: string, entityKind?: string): boolean {
  if (entityKind) return /gobiernos? locales?|municipal/i.test(entityKind);
  return /^(MUNICIPALIDAD|MANCOMUNIDAD|EMPRESA (?:EL[EÉ]CTRICA )?MUNICIPAL|EMPRESA MUNICIPAL)/i.test(entity.trim());
}
