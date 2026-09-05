import type { Tender, TenderScopeType, TenderParticipationScope, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";

/**
 * One item from a PEMEX subsidiary's "Concursos Abiertos" SharePoint list
 * (`www.pemex.com/.../concursosabiertos/_api/web/lists/getbytitle('...')/items`),
 * confirmed against a real 2,067-item export of the
 * "Concursos-Abiertos-PEP" (Pemex Exploración y Producción) list.
 *
 * Unlike Compras MX or CFE's `msc.cfe.mx`, this SharePoint site allows
 * fully anonymous REST access (`isAnonymousUser: true` in the page's own
 * `_spPageContextInfo`) with no anti-bot layer at all — confirmed by the
 * absence of any WAF cookies/headers and by the request succeeding with a
 * plain unauthenticated fetch. This closes the "does PEMEX have its own
 * usable portal" question the same way dof-search-mapper.ts closed it for
 * DOF: PEMEX does, and it needs no workaround.
 *
 * The list name is misleading: "Concursos Abiertos" (Open Tenders) is a
 * historical archive going back to at least 2015, not a live "currently
 * open" view — confirmed real items with `vencimiento` (expiration) dates
 * years in the past sit alongside ones dated today. `status` here is
 * therefore derived by comparing `vencimiento` to the current time, the
 * same posture as inferStatus() in compras-mx-open-tenders-mapper.ts.
 *
 * Each PEMEX subsidiary (PEP, PTI, PL, PF, PCS, PPS, PE,
 * Concursos-e-invitaciones) has its own separately-named list under the
 * same site with an identical item shape — this mapper is
 * subsidiary-agnostic; the subsidiary/buyer name is passed in by the
 * caller per-list, not inferred from the item itself.
 */
export type PemexConcursoItem = {
  Id: number;
  Title?: string;
  descripcion?: string;
  inicio?: string; // ISO 8601
  vencimiento?: string; // ISO 8601
  tipoevento?: string;
  tiposuministro?: string;
  areacontratante?: string;
  Created?: string;
  Modified?: string;
  Attachments?: boolean;
};

/**
 * "Tipo de evento" — confirmed real values from the full PEP export:
 * "Nacional" (331), "Internacional bajo TLC" (1,634), "Internacional"
 * (102). Different literal wording from Compras MX's "Carácter del
 * procedimiento" ("INTERNACIONAL ABIERTO" etc.), so this is a dedicated
 * lookup rather than reusing inferParticipationScope() from heuristics.ts
 * — "Internacional" here is the same concept as Compras MX's
 * "INTERNACIONAL ABIERTO" (open to any foreign bidder, no treaty
 * requirement), just worded differently.
 */
const PARTICIPATION_SCOPE_BY_TIPOEVENTO: Record<string, TenderParticipationScope> = {
  NACIONAL: "national",
  "INTERNACIONAL BAJO TLC": "international_treaty",
  INTERNACIONAL: "international_open",
};

function inferParticipationScope(tipoevento: string | undefined): TenderParticipationScope | undefined {
  if (!tipoevento) return undefined;
  return PARTICIPATION_SCOPE_BY_TIPOEVENTO[tipoevento.toUpperCase().trim()];
}

/**
 * "Tipo de suministro" — confirmed real values: "Servicios" (1,054),
 * "Bienes" (805), "Obra pública" (196), "Arrendamientos" (9). An exact
 * lookup since this is a small, known set of literal values, same posture
 * as SCOPE_TYPE_BY_CONTRATACION in compras-mx-open-tenders-mapper.ts.
 */
const SCOPE_TYPE_BY_SUMINISTRO: Record<string, TenderScopeType> = {
  SERVICIOS: "services",
  BIENES: "equipment",
  "OBRA PÚBLICA": "works",
  ARRENDAMIENTOS: "equipment",
};

function inferScopeType(tiposuministro: string | undefined): TenderScopeType {
  if (!tiposuministro) return "services";
  return SCOPE_TYPE_BY_SUMINISTRO[tiposuministro.toUpperCase().trim()] ?? "services";
}

function inferStatus(vencimiento: string | undefined): TenderStatus {
  if (!vencimiento) return "open";
  const expires = new Date(vencimiento);
  if (Number.isNaN(expires.getTime())) return "open";
  return expires.getTime() > Date.now() ? "open" : "submission_closed";
}

function toIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const PEMEX_SITE_ORIGIN = "https://www.pemex.com";
const CONCURSOS_ROOT_PATH = "/procura/procedimientos-de-contratacion/concursosabiertos";

/**
 * Real per-list item display-form path (`Lists/<ListInternalName>/
 * DispForm.aspx`), confirmed 2026-09-03 via each list's own
 * `DefaultDisplayFormUrl` REST property — briefly used here, then
 * abandoned the same day: opening one for real (item ID intact) redirected
 * to `pemex.com/acceso-denegado`, a login form. So PEMEX's anonymous
 * access covers the REST *data* API but not this rendered *UI* page —
 * different auth zones for the same site, not the blanket "anonymous
 * everywhere" the earlier `isAnonymousUser: true` finding suggested. Kept
 * only as a comment so a future attempt doesn't re-derive and re-try the
 * same dead end.
 *
 * What IS confirmed real and publicly reachable (no login) is each
 * subsidiary's own search page under `Paginas/` — e.g.
 * `Paginas/Pemex-Transformación-Industrial.aspx`, visually confirmed by
 * the user loading it with no login prompt. Real page filenames enumerated
 * 2026-09-03 via `_api/web/getfolderbyserverrelativeurl('.../Paginas')/
 * files` (anonymous REST folder listing, not guessed):
 * Pemex-Exploración-y-Producción.aspx, Pemex-Transformación-Industrial.aspx,
 * Pemex-Logística.aspx, Pemex.aspx, PEP.aspx, default.aspx, plus several
 * Exploración-y-Producción-region pages (Sur/Norte/Centro/Marinas...) not
 * used here since they don't correspond to any of the 7 known lists. No
 * dedicated page exists for PF, PPS, or Concursos-e-invitaciones — those
 * fall back to the root search page below rather than a guessed filename.
 * This means sourceUrl is a real, working SEARCH page (a human can look up
 * the tender there by number/description), not a per-item deep link — no
 * anonymous per-item link exists at all on this site.
 */
const SEARCH_PAGE_PATH_BY_LIST_TITLE: Record<string, string> = {
  "Concursos-Abiertos-PEP": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Exploración-y-Producción.aspx`,
  "Concursos-Abiertos-PTI": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Transformación-Industrial.aspx`,
  "Concursos-Abiertos-PL": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex-Logística.aspx`,
  // "Pemex.aspx" is the best real-filename match for the generic
  // corporate list (buyer "Petróleos Mexicanos (PEMEX)") — not visually
  // confirmed to show PE-list content specifically, unlike PEP/PTI/PL.
  "Concursos-Abiertos-PE": `${CONCURSOS_ROOT_PATH}/Paginas/Pemex.aspx`,
  "Concursos-Abiertos-PF": CONCURSOS_ROOT_PATH,
  "Concursos-Abiertos-PPS": CONCURSOS_ROOT_PATH,
  "Concursos-e-invitaciones": CONCURSOS_ROOT_PATH,
};

export function mapPemexConcursoItemToTender(
  item: PemexConcursoItem,
  buyer: string,
  sourceName: string,
  listTitle: string,
  // Most subsidiary lists are named "Concursos-Abiertos-*" (open tenders),
  // but "Concursos-e-invitaciones" mixes in "Invitación a Cuando Menos Tres
  // Personas" procedures — a real, distinct LAASSP/LOPSRM-equivalent
  // procedure type, not a formatting choice — so the caller passing the
  // list's own real label keeps procedureType honest per source list
  // instead of asserting every item is a "Concurso Abierto".
  procedureLabel = "Concurso Abierto",
): Tender | null {
  const tenderNumber = item.Title?.trim();
  const description = item.descripcion?.trim();
  if (!tenderNumber || !description) return null;

  const publicationDate = toIso(item.inicio) ?? toIso(item.Created) ?? new Date().toISOString();
  const scopeType = inferScopeType(item.tiposuministro);
  // buyer is included in the haystack so every PEMEX tender picks up
  // "energy" even when the description text itself doesn't happen to
  // mention petróleo/gas/etc. — "Pemex Exploración y Producción" alone
  // matches the \bpemex\b pattern.
  const industries = classifyIndustries(description, buyer);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    // Own slug namespace ("pemex-") — PEMEX/CFE are legally distinct
    // "Empresas Productivas del Estado" that never appear in Compras MX
    // (see README.md), so there's no cross-source de-duplication to line
    // up with, unlike the comprasmx-* slug scheme.
    slug: `pemex-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(description),
    summary: untranslated(description),
    buyer,
    country: "Mexico",
    // PEMEX is a constitutionally distinct "Empresa Productiva del Estado",
    // not a federal ministry — same category as CFE. See
    // inferGovernmentLevel() in heuristics.ts, which already recognizes
    // "pemex"/"petróleos mexicanos" as "public_company"; hardcoded here
    // since every item from this source is PEMEX by construction.
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType: item.areacontratante?.trim() ? `${procedureLabel} (${item.areacontratante.trim()})` : procedureLabel,
    participationScope: inferParticipationScope(item.tipoevento),
    publicationDate,
    // Deliberately NOT populating submissionDeadline from `vencimiento`:
    // real data shows it's 1-2 years out from `inicio` (e.g. created
    // 2026-08-27, vencimiento 2028-08-27) — "vencimiento" is this
    // standing Concurso Abierto mechanism's own validity/expiration
    // window, not a one-time bid submission cutoff the way Compras MX's
    // "FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES" genuinely is.
    // Surfacing it as submissionDeadline would tell a bidder "you have
    // until 2028" when that isn't what the field means, actively
    // misleading a bid/no-bid decision. Still used for status inference
    // below, where "is this mechanism still valid" is the right question.
    status: inferStatus(item.vencimiento),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [],
    risks: [],
    relevance: classifyRelevance({ title: description, industries, scopeType, buyer }),
    sourceName,
    // Real, anonymously-reachable search page for this list (see
    // SEARCH_PAGE_PATH_BY_LIST_TITLE above) — not a per-item deep link;
    // none exists anonymously on this site (DispForm.aspx requires login).
    // A list title this mapper doesn't recognize falls back to the same
    // root search page as the three known-but-pageless subsidiaries.
    sourceUrl: `${PEMEX_SITE_ORIGIN}${SEARCH_PAGE_PATH_BY_LIST_TITLE[listTitle] ?? CONCURSOS_ROOT_PATH}`,
    createdAt: now,
    updatedAt: now,
  };
}
