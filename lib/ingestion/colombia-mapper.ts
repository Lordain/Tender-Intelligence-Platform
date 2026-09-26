import type { GovernmentLevel, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { secopProcessApiUrl } from "@/lib/secop-links";

/**
 * One row from Colombia's real "SECOP II - Procesos de Contratación"
 * open-data set on `datos.gov.co` (Socrata resource `p6dx-8zbt`, published
 * by Agencia Nacional de Contratación Pública — Colombia Compra
 * Eficiente). Confirmed real and reachable with NO authentication via the
 * standard public Socrata read endpoint:
 *
 *   https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=N&$offset=M
 *
 * (SODA2 — the dataset's own export dialog defaults to SODA3, which
 * requires an auth token; the plain `/resource/<id>.json` SODA2 path
 * needs none for read access to a public dataset, confirmed by a real
 * unauthenticated request returning real rows). 9,097,326 rows total as
 * of this writing — by far the largest single source this platform has
 * touched; a real pull needs `$limit`/`$offset` pagination and almost
 * certainly a `$where` date filter (e.g. recent `fecha_de_publicacion_del`
 * only), not a full dump.
 *
 * Field names are Socrata's auto-generated column identifiers, derived
 * from each column's real display name by stripping/mangling accents —
 * e.g. "Descripción del Procedimiento" becomes `descripci_n_del_procedimiento`
 * (not a typo here). Values themselves keep real accented Spanish text.
 *
 * This dataset is confirmed real from a direct, unauthenticated browser
 * request returning 5 real rows (DANE, Barranquilla, a Bogotá school,
 * INVIAS, a Putumayo municipality) — the field mapping below is built
 * from those 5 rows and will need broadening as more real data is seen
 * (see the status/scope-type functions' comments for what's still a
 * best-effort guess from a small sample).
 */
export type SecopProcesoRow = {
  entidad?: string;
  nit_entidad?: string;
  departamento_entidad?: string;
  ciudad_entidad?: string;
  ordenentidad?: string; // "Nacional" | "Territorial"
  id_del_proceso?: string;
  /**
   * "CO1.BDOS.*" — the id the archivos-metadata dataset (dmgg-8hin) files
   * documents under, in its `proceso` column. Measured 2026-09-25 on 40
   * recent licitaciones: this matched all 40; the noticeUID and
   * id_del_proceso lookups matched none.
   */
  id_del_portafolio?: string;
  referencia_del_proceso?: string;
  nombre_del_procedimiento?: string;
  descripci_n_del_procedimiento?: string;
  fecha_de_publicacion_del?: string; // "yyyy-mm-ddT00:00:00.000"
  precio_base?: string;
  modalidad_de_contratacion?: string;
  duracion?: string;
  unidad_de_duracion?: string;
  fecha_de_recepcion_de?: string;
  estado_del_procedimiento?: string;
  adjudicado?: string; // "No" | "Si" (real values seen so far are all "No")
  nombre_del_proveedor?: string;
  codigo_principal_de_categoria?: string; // UNSPSC-shaped, e.g. "V1.80111500"
  estado_de_apertura_del_proceso?: string; // "Abierto" | "Cerrado"
  tipo_de_contrato?: string;
  urlproceso?: { url?: string };
  codigo_entidad?: string;
  // Fields confirmed real from the dataset's own SODA API field dictionary
  // (user pulled it directly, 2026-09-05) but not previously captured:
  // `estado_resumen` ("Estado Resumen") is a coarser status than
  // `estado_del_procedimiento` — not yet used for anything (no real value
  // sample yet), captured for future use. `fecha_adjudicacion`/
  // `valor_total_adjudicacion` ("Fecha Adjudicacion"/"Valor Total
  // Adjudicacion") are the real award date/value, previously never
  // captured at all despite `awardDate`/`awardedValue` existing as real
  // Tender fields other mappers already populate (compranet5-mapper.ts,
  // compras-mx-contracts-mapper.ts, ocds-mapper.ts). Deliberately NOT
  // capturing `nombre_del_adjudicador` ("Nombre del Adjudicador") as a
  // provider signal — per the same field dictionary this is a DIFFERENT
  // field from `nombre_del_proveedor` ("Nombre del Proveedor Adjudicado")
  // — the adjudicador is the awarding body/committee, not the winning
  // contractor.
  estado_resumen?: string;
  fecha_adjudicacion?: string;
  valor_total_adjudicacion?: string;
};

/**
 * Colombia is a unitary republic, not federated like Mexico — "Nacional"
 * (central government) is the clean federal-equivalent match. "Territorial"
 * covers both departmental (state-equivalent) and municipal entities with
 * no further field to split them, so the buyer name itself is checked for
 * municipal-specific words ("municipio", "distrito", "alcaldía" — all real,
 * seen in the 5-row sample) before falling back to "state" for anything
 * territorial that isn't obviously a municipality (e.g. a "Gobernación").
 */
function inferGovernmentLevel(ordenEntidad: string | undefined, entidad: string | undefined): GovernmentLevel {
  if (ordenEntidad === "Nacional") return "federal";
  if (/municipio|distrito|alcald[íi]a/i.test(entidad ?? "")) return "municipal";
  return "state";
}

const SCOPE_TYPE_BY_TIPO_CONTRATO: Record<string, TenderScopeType> = {
  "PRESTACIÓN DE SERVICIOS": "services",
  COMPRAVENTA: "equipment",
  SUMINISTRO: "equipment",
  "OBRA": "works",
  CONSULTORÍA: "consulting",
};

/**
 * SECOP II publishes the same procurement more than once, and the copies
 * differ only by a phase label glued onto BOTH the reference and the name:
 *
 *   JBB-LP-004-2026                          CONCESION CAV
 *   JBB-LP-004-2026 (Presentación de oferta)  CONCESION CAV (Presentación de oferta)
 *
 * Since the slug is built from the reference (buildSecopSlug, below), that
 * produced two rows for one tender — confirmed on real data (2026-09-11): identical buyer, identical
 * description, identical everything else. Stripping the suffix collapses them
 * onto one slug, so the upsert dedupes them by itself.
 *
 * Only a trailing parenthetical naming a KNOWN phase is removed, never any
 * trailing parenthetical: real Colombian references carry meaningful ones
 * ("(Obra)", "(Grupo 2)"), and dropping those would merge tenders that are
 * genuinely different. Loops because the label nests —
 * "(Fase de Selección (Presentación de ofertas))".
 */
const PROCESS_PHASE_WORDS =
  /fase de selecci[óo]n|presentaci[óo]n de ofertas?|borrador|convocatoria|adjudicaci[óo]n|evaluaci[óo]n de ofertas?/i;

/**
 * The same labels as complete strings, accent-free and without their inner
 * parentheses, for prefix-matching a TRUNCATED one — see
 * stripTruncatedPhaseSuffix().
 */
const PROCESS_PHASE_LABELS = [
  "fase de seleccion presentacion de ofertas",
  "fase de seleccion presentacion de oferta",
  "presentacion de ofertas",
  "presentacion de oferta",
  "evaluacion de ofertas",
  "convocatoria",
  "adjudicacion",
  "borrador",
];

/**
 * SECOP truncates `nombre_del_procedimiento` at exactly 200 characters —
 * confirmed on seven real rows (2026-09-12), every one of them 200 long to
 * the character. When the phase label is what gets cut, its closing
 * parenthesis goes with it:
 *
 *   ...DEPARTAMENTO DE AMAZONAS. (Fase de Selección (P
 *   ...EN SEDES URBANAS Y RURALES (Presentació
 *   ...DEPARTAMENTO DE ARAUCA (Fas
 *
 * stripProcessPhaseSuffix()'s regex needs a closed parenthetical, so it left
 * these alone — and the ragged fragment went straight into the public feed as
 * part of the tender's title. It also made the re-published copy look like a
 * DIFFERENT tender from the original to anything comparing titles, which is
 * how check-duplicate-ids came to report seven "collisions" that were nothing
 * of the sort.
 *
 * Cuts from the first parenthesis that is never closed, and only when what
 * follows is the beginning of a known phase label — "(Fas" goes, "(ETAPA" and
 * "(Grupo 2" stay. Three characters minimum, so a bare "(A" is never enough
 * to lose text on.
 */
function stripTruncatedPhaseSuffix(value: string): string {
  let depth = 0;
  let openedAt = -1;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") {
      if (depth === 0) openedAt = i;
      depth += 1;
    } else if (value[i] === ")") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) openedAt = -1;
    }
  }
  if (depth === 0 || openedAt < 0) return value;

  const fragment = value
    .slice(openedAt + 1)
    .replace(/[()]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (fragment.length < 3) return value;
  if (!PROCESS_PHASE_LABELS.some((label) => label.startsWith(fragment))) return value;

  return value.slice(0, openedAt).trim();
}

export function stripProcessPhaseSuffix(value: string): string {
  // Truncated tail first: it is the only thing that can sit AFTER a complete
  // parenthetical ("NAME (Obra) (Fase de Selecci"), and removing it is what
  // lets the loop below see the complete one at the end of the string.
  let out = stripTruncatedPhaseSuffix(value.trim());
  for (let guard = 0; guard < 3; guard += 1) {
    const match = out.match(/\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
    if (!match || match.index === undefined || !PROCESS_PHASE_WORDS.test(match[1])) break;
    out = out.slice(0, match.index).trim();
  }
  return out;
}

/**
 * A Colombian process reference is an ENTITY-LOCAL sequence: every
 * municipality, school and ministry issues its own LP-001-2026,
 * LP-002-2026, LP-003-2026. `secop-${slugify(referencia)}` therefore put
 * completely unrelated procurements on one slug, and because the import
 * upserts by slug, the second one written silently DESTROYED the first —
 * four collisions were visible in a single screen of real output on
 * 2026-09-12 (secop-lp-002-2026, -003-, -005-, -006- each carrying two
 * different tenders from two different buyers). The same bug poisons the
 * slug-keyed block list: deleting one municipality's contract permanently
 * blocked another municipality's unrelated project.
 *
 * The fix qualifies the reference with the buying entity's NIT (its tax
 * id) — stable, present on every real row seen, and exactly the thing that
 * scopes the sequence. Note what it deliberately does NOT use:
 * `id_del_proceso` is globally unique and would have been the obvious key,
 * but the phase-variant copies of ONE procurement
 * ("JBB-LP-004-2026" / "JBB-LP-004-2026 (Presentación de oferta)") are
 * separate dataset rows with separate `id_del_proceso` values, so keying on
 * it would re-open the duplicate this file's stripProcessPhaseSuffix()
 * closed on 2026-09-11. NIT + phase-stripped reference closes both: same
 * entity and same reference collapse, different entities never do.
 *
 * `codigo_entidad` is the fallback (same entity, different column), then
 * the globally unique process id — never the bare reference again, which
 * is the thing that collided.
 *
 * Changing this changes every existing Colombian row's identity;
 * scripts/migrate-colombia-slugs.ts re-keys the stored rows and the
 * deletion block list onto the new scheme.
 */
export function buildSecopSlug(
  row: Pick<SecopProcesoRow, "nit_entidad" | "codigo_entidad" | "id_del_proceso">,
  phaseStrippedTenderNumber: string,
): string {
  const entity = row.nit_entidad?.trim() || row.codigo_entidad?.trim() || "";
  if (entity) return `secop-${slugify(entity)}-${slugify(phaseStrippedTenderNumber)}`;
  const processId = row.id_del_proceso?.trim();
  if (processId) return `secop-${slugify(processId)}`;
  return `secop-${slugify(phaseStrippedTenderNumber)}`;
}

/**
 * Reference-shaped or otherwise contentless procedure names, e.g. "CERRITO",
 * "Nº LP-SI-001-2026", "OBRA SAN BERNARDO", "PRESTACION DE SERVICIOS",
 * "LICITACION DE OBRA PUBLICA INV-0001-2026".
 *
 * `nombre_del_procedimiento` is frequently an internal label — it tells a
 * reader nothing, and it is also what the relevance keywords and the
 * translator see, so a contentless name degrades classification and the
 * Chinese title alike. `descripci_n_del_procedimiento` carries the real
 * object of the contract.
 */
function isUninformativeName(name: string): boolean {
  const compact = name.replace(/\s+/g, " ").trim();
  if (compact.length < 25) return true;
  // A bare code, optionally introduced by procurement boilerplate.
  if (/^(licitaci[óo]n\s+p[úu]blica|licitaci[óo]n\s+de\s+obra\s+p[úu]blica|obra\s+p[úu]blica|contrataci[óo]n|concurso\s+de\s+m[ée]ritos|invitaci[óo]n)?\s*(n[°ºo.]*\s*)?[A-Za-z0-9]{1,6}[-–][A-Za-z0-9\-–/.]{2,}$/i.test(compact)) {
    return true;
  }
  // Pure boilerplate with no object: "PRESTACION DE SERVICIOS".
  return /^(prestaci[óo]n de servicios|obra p[úu]blica|licitaci[óo]n p[úu]blica|suministro|compraventa|concesi[óo]n)$/i.test(compact);
}

/** Cuts at a word boundary so a description used as a title doesn't end mid-word. */
function titleFromDescription(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (compact.length <= 160) return compact;
  const cut = compact.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 120 ? cut.slice(0, lastSpace) : cut).replace(/[;,.\s]+$/, "")}…`;
}

/** Only 2 real distinct values seen in the 5-row sample ("Prestación de servicios", "Otro") — an exact lookup for the one real signal seen, "services" as the fallback since that's this dataset's overwhelming majority in the sample. Needs broadening once a larger real pull is available. */
function inferScopeType(tipoContrato: string | undefined): TenderScopeType {
  if (!tipoContrato) return "services";
  return SCOPE_TYPE_BY_TIPO_CONTRATO[tipoContrato.toUpperCase().trim()] ?? "services";
}

/**
 * `adjudicado` ("Sí"/"No") is the real awarded signal — checked first
 * regardless of the other status fields. `estado_de_apertura_del_proceso`
 * ("Abierto"/"Cerrado") is the clean open/closed signal for everything
 * else. `estado_del_procedimiento` ("Seleccionado", "Evaluación", ...) is
 * a finer-grained real phase name but not used here yet — the 5-row
 * sample isn't enough to build a confident full mapping from it (e.g.
 * "Seleccionado" appeared on rows with `adjudicado: "No"`, so it does NOT
 * mean "awarded" despite the name — a real trap worth flagging, not
 * guessing past).
 *
 * Real gap (2026-09-05): `awardedTo`/`nombre_del_proveedor` was already
 * captured and stored on the tender but never fed into status at all —
 * for a "Contratación Directa" (direct/sole-source) process especially,
 * a real named provider is definitive proof the opportunity is already
 * decided (no competitive bidding was ever going to happen), even when
 * `adjudicado` still reads "No" — the user found a live SECOP II process
 * whose own "Fecha de publicación" was already later than its contract
 * signing/execution-start dates, i.e. published well after the fact, and
 * asked for these to stop looking like open opportunities. Checked ahead
 * of `adjudicado` for the same reason: a stale/lagging "No" shouldn't
 * override a real provider name that's already there.
 *
 * Second real signal added same day: the user manually cross-checked a
 * live SECOP II process page and found `estado_del_procedimiento`
 * (labeled "Estado" there) reading literally "Proceso adjudicado y
 * celebrado" ("process awarded and executed") — confirming this field
 * DOES carry an unambiguous awarded signal after all, just not via the
 * "Seleccionado" trap flagged above. Checked as a plain `/adjudicad/i`
 * substring match, which "Seleccionado"/"Evaluación" etc. never contain,
 * so the earlier trap can't recur.
 */
function inferStatus(
  adjudicado: string | undefined,
  aperturaEstado: string | undefined,
  providerName: string | undefined,
  estadoDelProcedimiento: string | undefined,
): TenderStatus {
  if (providerName && providerName !== "No Definido") return "awarded";
  if (adjudicado?.trim().toLowerCase() === "si" || adjudicado?.trim().toLowerCase() === "sí") return "awarded";
  if (estadoDelProcedimiento && /adjudicad/i.test(estadoDelProcedimiento)) return "awarded";
  if (aperturaEstado === "Cerrado") return "submission_closed";
  return "open";
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Real finding (2026-09-04): `id_del_proceso` from the main process
 * dataset (`CO1.REQ.*`) does NOT match the archivos-metadata dataset's
 * `proceso` column (`CO1.BDOS.*` in a fresh unfiltered sample) — a real
 * bulk run confirmed 0 matching rows across 440+ candidates. The user then
 * manually opened one tender's own `sourceUrl` (community.secop.gov.co,
 * CAPTCHA-gated) and found its address bar carries a THIRD id namespace,
 * `noticeUID=CO1.NTC.*` — and confirmed with their own eyes that this
 * specific tender's detail page really does list real, downloadable
 * attachments. `urlproceso.url` (stored as `sourceUrl` by
 * mapSecopRowToTender, below) carries this exact noticeUID for every
 * tender that has a real deep link — ingest-colombia.ts's document-fetch
 * step tries it against the (CAPTCHA-free, genuinely open) archivos
 * dataset's `proceso` filter before falling back to `id_del_proceso`.
 *
 * Real bug confirmed (2026-09-05): some rows' `urlproceso.url` is not a
 * deep link at all — it's the bare SECOP login page
 * (`https://community.secop.gov.co/STS/Users/Login/Index`, no
 * `noticeUID` query param), which a human clicking "来源链接" just lands
 * on with nothing to act on. mapSecopRowToTender uses this function to
 * gate which sourceUrl actually gets stored: a login-page-only url falls
 * back to the datos.gov.co API link instead, which is at least a working,
 * specific reference for this process even without a CAPTCHA-free public
 * detail page.
 */
export function extractNoticeUidFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get("noticeUID")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes `duracion` + `unidad_de_duracion` into days, feeding
 * classifyRelevance()'s SHORT_DURATION_DAYS/LONG_DURATION_DAYS signal from
 * a real STRUCTURED field instead of the Spanish text-phrase scan
 * (DURATION_ANCHOR in relevance.ts) that Colombia's title/summary text
 * never actually contains — without this, Colombia could never trigger the
 * duration signal at all, real or not.
 *
 * Real bug confirmed (2026-09-05, task "确认工期信号在真实数据上生效"): every
 * row of the real captured lib/ingestion/__fixtures__/sample-colombia-secop.json
 * (5/5) carries `unidad_de_duracion` as literally "día(s)" — the header
 * comment here had already guessed this exact "Día(s)" shape, but the
 * DAYS_PER_UNIT map/lookup below never actually accounted for the "(s)"
 * suffix, so `DAYS_PER_UNIT["día(s)"]` was always undefined and this
 * function silently returned undefined for every single Colombia row —
 * the duration signal had never fired for Colombia at all, confirming the
 * exact risk this comment already flagged. Fixed by stripping any
 * parenthesized suffix before the lookup. "Semana(s)"/"Mes(es)"/"Año(s)"
 * are inferred to follow the identical SECOP II dropdown convention (same
 * fix handles them once one is captured) but — same DEFENSIVE posture as
 * before — aren't yet confirmed real themselves; only "día(s)" is.
 */
const DAYS_PER_UNIT: Record<string, number> = {
  "día": 1,
  "dias": 1,
  "días": 1,
  semana: 7,
  semanas: 7,
  mes: 30,
  meses: 30,
  "año": 365,
  ano: 365,
  años: 365,
  anos: 365,
};

function normalizeDurationDays(duracion: string | undefined, unidad: string | undefined): number | undefined {
  if (!duracion || !unidad) return undefined;
  const count = Number(duracion);
  if (!Number.isFinite(count) || count <= 0) return undefined;
  const bareUnit = unidad.trim().toLowerCase().replace(/\(.*?\)/g, "").trim();
  const perUnit = DAYS_PER_UNIT[bareUnit];
  return perUnit !== undefined ? Math.round(count * perUnit) : undefined;
}

/**
 * SECOP II modalidades this platform ingests at all — public open tenders,
 * and nothing else (2026-09-11, explicit request: 只加入 Modalidad de
 * Contratación = Licitación pública 或 Licitación pública Obra Pública，
 * 非这两个条目的项目都不要加进系统).
 *
 * This replaces the "hide a Colombia tender that has no submission
 * deadline" rule, which was the previous, indirect attempt at the same
 * goal. That rule was both too broad and too narrow: it hid genuine open
 * tenders whose deadline datos.gov.co had not synced yet (37 rows imported
 * on 2026-09-08, 18 hidden, 14 of them flagship), while still letting
 * plenty of Contratación Directa / régimen especial rows through whenever
 * they happened to carry a date. Filtering on the modalidad says what was
 * actually meant.
 *
 * Matched on a normalized prefix rather than exact string equality:
 * datos.gov.co is inconsistent about accents and spacing in this field
 * ("Obra Publica" and "Obra Pública" both occur), and an exact-match list
 * would silently drop real licitaciones over a missing tilde — the failure
 * mode being avoided here in the first place. "licitacion publica" is
 * narrow enough that only the two intended values can match it.
 */
const INGESTED_MODALIDAD_PREFIX = "licitacion publica";

function normalizeModalidad(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Exported for scripts/tests that need the same gate without re-mapping a row. */
export function isIngestedColombiaModalidad(modalidad: string | null | undefined): boolean {
  if (!modalidad) return false;
  return normalizeModalidad(modalidad).startsWith(INGESTED_MODALIDAD_PREFIX);
}

/**
 * The exceptions to the Licitación-pública-only rule: named sectors whose
 * state companies contract under their own manuals — *Contratación régimen
 * especial* — so none of their buying could pass the gate above.
 *
 *   rail  (user, 2026-09-26: 只对特殊制度采购的大型项目开放)
 *   power (user, 2026-09-26: 电力公司)
 *   oil   (user, 2026-09-26: Ecopetrol 集团的工程总包，只收工程，不收油井作业服务)
 *
 * Every one admits only that modalidad, only from its named companies, only
 * when the ordinary relevance rules call the process 大型项目 (flagship), and
 * never a loan, a credit line or an energy/gas purchase agreement. Power and
 * oil must ALSO read as works or equipment in the title: régimen especial
 * amounts are unreliable (an EPM relay-module order at 242 bn COP, a
 * hospital's single ultrasound scanner at 159 bn), so the price alone must
 * not be what lets a row in. Anything that fails is dropped in
 * mapSecopRowToTender exactly as if the gate had refused it.
 *
 * Measured through this gate before shipping (SECOP II, 2026-03-01 to
 * 2026-09-26, every régimen especial row of the named companies): see the
 * figures in lib/ingestion/README.md's rail-and-metro section.
 *
 * `entities` are fragments of `entidad` as datos.gov.co stores it (upper
 * case), and deliberately free of accented letters: the live connector sends
 * them to SoQL, whose `like` compares bytes, so "ENERGÍA" and "ENERGIA" are
 * both written in the data and only an unaccented fragment matches both.
 */
type SpecialRegimeSector = {
  key: "rail" | "power" | "oil";
  entities: readonly string[];
  /** When set, the folded title/summary must match — the "works or equipment" test. */
  requiresWork?: RegExp;
  /** When set, a folded title/summary matching it is dropped — e.g. well services for oil. */
  excludesWork?: RegExp;
};

const POWER_WORK = /construc|\bobras?\b|montaje|subestacion|linea(s)? de (transmision|distribucion)|redes? (electric|de distribucion|de media|de baja)|parque (solar|eolico|de generacion)|generacion|fotovolta|eolic|hidroelectric|transformador|suministro e instalacion|puesta en (servicio|funcionamiento|operacion)|moderniz|repotenci|reposicion/;
const OIL_WORK = /construc|obras? civiles|montaje|procura|\bepc\b|\bipc\b|ingenieria, procura|facilidades de (produccion|superficie)|planta de/;
// "perforación DE" only: Ecopetrol's own EPC contracts name the department
// that commissions them — "Vicepresidencia de Proyectos y Perforación" — and
// the bare word dropped both of its 130 bn COP works contracts.
const OIL_WELL_SERVICES = /\bpozos?\b|completamiento|reacondicionamiento|workover|perforacion de|abandono|cabezal|operacion (local )?de estaciones|servicios? de (ejecucion de mantenimiento y )?operacion/;

export const SPECIAL_REGIME_SECTORS: readonly SpecialRegimeSector[] = [
  {
    key: "rail",
    entities: [
      "METRO DE BOGOTA",
      "TRANSPORTE MASIVO DEL VALLE DE ABURRA", // Metro de Medellín
      "PROMOTORA FERROCARRIL DE ANTIOQUIA",
      "EMPRESA FERREA REGIONAL", // Regiotram del Norte / de Occidente
      "REGIOTRAM",
    ],
  },
  {
    key: "power",
    entities: [
      "EMPRESAS PUBLICAS DE MEDELLIN", // EPM
      "ELECTRIFICADORA", // del Huila, de Santander, del Meta, del Caquetá …
      "EMPRESA DE ENERGIA", // de Pereira, del Quindío, del Guainía, de Boyacá …
      "CENTRALES ELECTRICAS",
      "CENTRALES DE ENERGIA",
      "CENTRAL HID", // Central Hidroeléctrica de Caldas — written "HIDORELECTRICA" in the data
      "HIDROELECTRICA ITUANGO",
      "EMPRESA URRA",
      "GECELCA",
      "GESTION ENERGETICA", // GENSA
      "INTERCOLOMBIA",
      "INTERCONEXION ELECTRICA", // ISA
      "DE ENERGIA DE ANTIOQUIA",
      "GENERADORA DE ENERG", // del Tolima
      "WIND AUTOGEN",
    ],
    requiresWork: POWER_WORK,
  },
  {
    key: "oil",
    entities: [
      "EMPRESA COLOMBIANA DE PETROLEOS",
      "ECOPETROL",
      "HOCOL",
      "CENIT TRANSPORTE",
      "OLEODUCTO CENTRAL", // Ocensa
      "OLEODUCTO BICENTENARIO",
      "REFINERIA DE CARTAGENA",
    ],
    requiresWork: OIL_WORK,
    excludesWork: OIL_WELL_SERVICES,
  },
];

/** Every sector's fragments, for the live connector's server-side filter. */
export const SPECIAL_REGIME_ENTITY_SOQL_FRAGMENTS = SPECIAL_REGIME_SECTORS.flatMap((sector) => sector.entities);

/**
 * Schools, municipalities and police units that merely carry one of the
 * names ("INSTITUCION EDUCATIVA ECOPETROL", "MUNICIPIO DE URRAO") are not the
 * company.
 */
const NOT_THE_COMPANY = /^(INSTITUCION EDUCATIVA|CENTRO ETNOEDUCATIVO|MUNICIPIO|POLICIA|ALCALDIA)/;

const SPECIAL_REGIME_PREFIX = "contratacion regimen especial";

/**
 * Loans, credit lines and supply agreements for energy or gas. Metro de
 * Bogotá registers its development-bank financing under this modalidad at
 * hundreds of billions of pesos, and Ecopetrol its credit facilities and
 * firm gas-transport contracts — the largest "contracts" there are, and
 * nothing anyone can bid on.
 */
const NOT_A_TENDER = /emprestito|prestamo|linea de credito|contrato de credito|convenio de credito|credit agreement|credito (por|tesoreria)|el banco (acepta|otorga)|banco (europeo|interamericano|mundial)|suministro de energia|energia y potencia|transporte de gas|gas natural firme/;

/**
 * Services no sector's exception is for, whatever their size: the same
 * short list a works-or-equipment reader would skip.
 */
const PLAIN_SERVICES = /capacitacion|vigilancia|\baseo\b|viajes|seguros?\b|poliza|todo riesgo|fiducia|auditoria|interventoria|consultoria|asistencia tecnica|licenciamiento|diagnosticos?|proteccion personal|planes de salud|alimentacion/;

/**
 * Ecopetrol's community investment — school fences, sports grounds — is
 * registered as its own construction work. Real building, but social
 * programme work in the company's municipalities, not the oil company's
 * engineering, and the reason oil needs this on top of OIL_WORK.
 */
const COMMUNITY_WORKS = /instituciones? educativas?|escenario (recreo)?deportivo|recreodeportivo|polideportivo|\bvivienda/;

/** The sector a row's régimen especial process belongs to, or null when it is not a candidate for an exception. */
export function specialRegimeSectorOf(row: Pick<SecopProcesoRow, "modalidad_de_contratacion" | "entidad">): SpecialRegimeSector["key"] | null {
  if (!row.modalidad_de_contratacion || !row.entidad) return null;
  if (!normalizeModalidad(row.modalidad_de_contratacion).startsWith(SPECIAL_REGIME_PREFIX)) return null;
  const entity = normalizeModalidad(row.entidad).toUpperCase();
  if (NOT_THE_COMPANY.test(entity)) return null;
  return SPECIAL_REGIME_SECTORS.find((sector) => sector.entities.some((fragment) => entity.includes(fragment)))?.key ?? null;
}

/**
 * Whether an exception candidate, once classified, is admitted.
 *
 * A disclosed amount is required for power and oil. Without one, 大型项目
 * came from a keyword alone ("construcción", "subestación"), and in the
 * first measurement that was how school fences and a sports ground paid for
 * by Ecopetrol, an insurance renewal and a fiduciary arrangement got in —
 * the size of an exception row has to be stated, not guessed.
 */
function admitsSpecialRegime(sectorKey: SpecialRegimeSector["key"], tier: string, text: string, estimatedValue: number | undefined): boolean {
  const sector = SPECIAL_REGIME_SECTORS.find((candidate) => candidate.key === sectorKey)!;
  const folded = normalizeModalidad(text);
  if (tier !== "flagship" || NOT_A_TENDER.test(folded) || PLAIN_SERVICES.test(folded) || COMMUNITY_WORKS.test(folded)) return false;
  if (sector.key !== "rail" && !estimatedValue) return false;
  if (sector.requiresWork && !sector.requiresWork.test(folded)) return false;
  if (sector.excludesWork && sector.excludesWork.test(folded)) return false;
  return true;
}

export type MapSecopRowOptions = {
  /**
   * Skips the modalidad gate below and maps the row anyway. ONLY for the
   * read-only what-if diagnostic (`scripts/survey-colombia.ts`), which has
   * to answer "how many tenders would widening the gate actually add" and
   * cannot do that by re-implementing this mapper's own field handling —
   * a second copy would drift and then quietly report numbers for rules
   * that are not the ones in force.
   *
   * No ingestion path passes this. A row mapped with it set still goes
   * through every other rule unchanged (relevance, value floor,
   * direct-award), so what comes back is what WOULD be ingested if the
   * gate were widened to that modalidad — not a bypass of the filtering.
   */
  ignoreModalidadGate?: boolean;
};

export function mapSecopRowToTender(
  row: SecopProcesoRow,
  sourceName: string,
  options: MapSecopRowOptions = {},
): Tender | null {
  // First gate, before anything else is parsed: a modalidad this platform
  // does not carry is not a tender we have any use for, whatever its value
  // or keywords say. The existing value/keyword rules (lib/relevance.ts)
  // still run afterwards, on what survives this.
  const specialRegimeSector = isIngestedColombiaModalidad(row.modalidad_de_contratacion) ? null : specialRegimeSectorOf(row);
  if (!options.ignoreModalidadGate && !isIngestedColombiaModalidad(row.modalidad_de_contratacion) && !specialRegimeSector) return null;

  const rawName = stripProcessPhaseSuffix(row.nombre_del_procedimiento?.trim() ?? "");
  const buyer = row.entidad?.trim();
  const tenderNumber = stripProcessPhaseSuffix(
    row.referencia_del_proceso?.trim() || row.id_del_proceso?.trim() || "",
  );
  if (!rawName || !buyer || !tenderNumber) return null;

  const description = row.descripci_n_del_procedimiento?.trim();
  // A contentless procedure name is replaced by the description — which is
  // what a reader, the keyword rules and the translator all actually need.
  const title = description && isUninformativeName(rawName) ? titleFromDescription(description) : rawName;

  const publicationDate = parseDate(row.fecha_de_publicacion_del);
  if (!publicationDate) return null;

  const summary = description || title;
  const scopeType = inferScopeType(row.tipo_de_contrato);
  const now = new Date().toISOString();

  const priceBase = row.precio_base ? Number(row.precio_base) : undefined;
  const estimatedValue = priceBase && priceBase > 0 ? priceBase : undefined;

  const providerName = row.nombre_del_proveedor?.trim();
  const awardedTo = providerName && providerName !== "No Definido" ? providerName : undefined;

  const submissionDeadline = parseDate(row.fecha_de_recepcion_de) ?? undefined;
  const structuredDurationDays = normalizeDurationDays(row.duracion, row.unidad_de_duracion);
  const governmentLevel = inferGovernmentLevel(row.ordenentidad, buyer);
  const procedureType = row.modalidad_de_contratacion?.trim() || "Unknown";
  const { industries, relevance } = classifyStoredTender({
    procedureType,
    tenderNumber,
    title,
    summary,
    buyer,
    country: "Colombia",
    governmentLevel,
    scopeType,
    estimatedValue,
    // Exactly what the row stores below, not a bare "COP" — the two only
    // differ when there is no value at all (where currency is ignored
    // anyway), but the whole point of this call is that it sees stored
    // values, so there is no reason to make an exception here.
    currency: estimatedValue ? "COP" : undefined,
    sourceName,
    structuredDurationDays,
  });

  // The sector exceptions admit 大型项目 works only — see SPECIAL_REGIME_SECTORS.
  if (specialRegimeSector && !admitsSpecialRegime(specialRegimeSector, relevance.tier, `${title} ${summary}`, estimatedValue)) return null;

  const awardDate = parseDate(row.fecha_adjudicacion) ?? undefined;
  const rawAwardedValue = row.valor_total_adjudicacion ? Number(row.valor_total_adjudicacion) : undefined;
  const awardedValue = rawAwardedValue && rawAwardedValue > 0 ? rawAwardedValue : undefined;

  return {
    id: crypto.randomUUID(),
    // Own slug namespace ("secop-") — a real, standalone connector, no
    // cross-source de-dup scheme to line up with. Entity-qualified, see
    // buildSecopSlug().
    slug: buildSecopSlug(row, tenderNumber),
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Colombia",
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    submissionDeadline,
    // Colombian public procurement is denominated in COP by law/convention
    // — the dataset carries no separate currency field to read directly
    // (unlike Compras MX's explicit "Moneda" column), so this is a real-
    // world fact treated as given, not a guess, the same posture as DOF
    // always being "federal" (see dof-mapper.ts).
    estimatedValue,
    currency: estimatedValue ? "COP" : undefined,
    // Persisted (migration 0029) purely so reclassify-tenders.ts classifies
    // this row with the same duration this import did — >= 360 days promotes
    // to flagship, and with nowhere to store it the reclassify path used to
    // demote every such Colombian row.
    structuredDurationDays,
    location: row.ciudad_entidad?.trim() && row.ciudad_entidad !== "No Definido" ? row.ciudad_entidad.trim() : row.departamento_entidad?.trim(),
    status: inferStatus(row.adjudicado, row.estado_de_apertura_del_proceso, providerName, row.estado_del_procedimiento),
    awardedTo,
    awardDate,
    awardedValue,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [
      { id: `${tenderNumber}-publication`, type: "publication", date: publicationDate },
      // Real gap fixed 2026-09-04: submissionDeadline was already being
      // computed above but never also reflected here, so the tender
      // detail page's key-dates timeline (which only ever renders
      // keyDates, same trap already documented in
      // licitia-vigente-mapper.ts) silently dropped it for every
      // Colombia tender that had one.
      ...(submissionDeadline ? [{ id: `${tenderNumber}-submission`, type: "submission" as const, date: submissionDeadline }] : []),
      // Real gap fixed 2026-09-05: `fecha_adjudicacion` (a real, dedicated
      // award-date column, confirmed via the dataset's own SODA field
      // dictionary) was never captured at all — a Colombia tender's public
      // page never showed a real 中标结果 date the way other sources' do.
      ...(awardDate ? [{ id: `${tenderNumber}-award`, type: "award" as const, date: awardDate }] : []),
    ],
    risks: [],
    relevance,
    sourceName,
    // Real, directly captured — urlproceso.url usually points at the
    // actual public tender page on community.secop.gov.co, BUT only when
    // it carries a real noticeUID (see extractNoticeUidFromUrl's header
    // comment above); some rows' urlproceso.url is just the bare SECOP
    // login page with nothing tender-specific in it, so that case falls
    // back to the datos.gov.co API link instead of storing a dead-end.
    sourceUrl: extractNoticeUidFromUrl(row.urlproceso?.url)
      ? row.urlproceso!.url!
      : secopProcessApiUrl(row.id_del_proceso),
    createdAt: now,
    updatedAt: now,
  };
}
