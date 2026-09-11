import type { GovernmentLevel, Tender, TenderKeyDate } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * ProInversión's Obras por Impuestos (OxI) convocatorias — Peru's THIRD
 * procurement channel, alongside SEACE/OECE (ordinary budget procurement) and
 * the APP concessions.
 *
 * Confirmed real (2026-09-11) from a file the user exported themselves:
 * `ListaConvocatoriaProceso_20260911.xlsx`, 422 rows, every one `En Proceso`,
 * "Última actualización: 10/09/2026".
 *
 * WHY THIS SOURCE EARNS ITS PLACE, given SEACE already exists:
 *
 * - It carries a REAL BID-SUBMISSION DEADLINE (`Fecha Presentación
 *   Propuestas`), on 400 of 423 rows. OECE's OCDS records carry no such field
 *   at all — see peru-oece-mapper.ts's header, where submissionDeadline is
 *   deliberately left unset because nothing in that data is one. Peru's
 *   deadline-based features exist because of this source.
 * - It is pre-filtered at source. Measured on that file: 134 of the 180
 *   build contracts survive this project's own relevance rules (74%), against
 *   15% for raw SEACE, because OxI simply has no stationery or catering in it.
 * - It carries the CUI (Invierte.pe investment code), which is the join key
 *   back to the same project in SEACE and at MEF.
 *
 * TWO KINDS OF CONVOCATORIA, and they are not the same opportunity:
 *   `Empresa Privada`            — the company that finances AND executes the
 *                                  work. 180 of 422. This is the contract.
 *   `Entidad Privada Supervisora` — the supervision contract. 242 of 422.
 *                                  Mapped like any other row and left to
 *                                  lib/relevance.ts, whose existing
 *                                  supervision rule (the user's 2026-09-07
 *                                  call, "只是监理 — inspection/oversight only")
 *                                  excludes 219 of them on its own. Not
 *                                  special-cased here: one place decides what
 *                                  is worth surfacing, and it is not the
 *                                  mapper.
 *
 * THE MECHANISM, and why every row carries a risk note (the user's call,
 * 2026-09-11, "两类都有 → 照收，加一个来源标签(提醒用户)"): under Ley N° 29230 a
 * private company pays for the public work up front and recovers it against
 * its own Peruvian income tax. The bidder therefore has to be a Peruvian
 * taxpayer. For a Chinese enterprise with a Peruvian entity that is a direct
 * bid; without one it is subcontracting or supply to whoever wins. That
 * distinction is not visible in the title, so it is attached to every row as
 * a risk rather than left for the reader to know. It deliberately states the
 * mechanism and points at the tender documents — per the user's standing
 * instruction, it does NOT assert that any particular company may or may not
 * participate, which only each process's own bases can settle.
 */
export type PeruOxiRow = {
  "Codigo Convocatoria": string;
  Departamento?: string;
  "Entidad Pública"?: string;
  "Nivel de Gobierno"?: string;
  "Tipo de Convocatoria"?: string;
  "Código Único de Inversiones (CUI)"?: string;
  "Nombre de la inversión"?: string;
  Función?: string;
  "Monto Convocatoria (S/)"?: string;
  "Año Convocatoria"?: string;
  "Fecha Convocatoria"?: string;
  "Fecha Integración Bases"?: string;
  "Fecha Presentación Propuestas"?: string;
  Estado?: string;
};

export const PERU_OXI_SOURCE_NAME = "ProInversión — Obras por Impuestos (Perú)";
export const PERU_OXI_SOURCE_URL = "https://www.investinperu.pe/es/app/obras-por-impuestos/proyectos";

/** Real values seen in the export, all six of them. */
const LEVEL_BY_NIVEL: Record<string, GovernmentLevel> = {
  "Gobierno Local Distrital": "municipal",
  "Gobierno Local Provincial": "municipal",
  "Gobierno Regional": "state",
  "Gobierno Nacional": "federal",
  "Gobierno Nacional- Gobierno Regional": "federal",
  "Universidad Pública": "federal",
};

/** `dd/MM/yyyy` — the only real date format in this export. ExcelJS hands back an ISO string when a cell is genuinely date-typed, so that shape is accepted too. */
function parseOxiDate(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** "3,932,633.54" — thousands separators, and a real 0 meaning "not published yet" (the Monto de Buena Pro column behaves the same way on the web page). */
function parseOxiAmount(raw: string | undefined): number | undefined {
  const value = Number((raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function mapPeruOxiRowToTender(row: PeruOxiRow, sourceName: string, sourceUrl: string): Tender | null {
  const tenderNumber = row["Codigo Convocatoria"]?.trim();
  const title = row["Nombre de la inversión"]?.trim();
  const buyer = row["Entidad Pública"]?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const publicationDate = parseOxiDate(row["Fecha Convocatoria"]);
  if (!publicationDate) return null;

  const submissionDeadline = parseOxiDate(row["Fecha Presentación Propuestas"]) ?? undefined;
  const clarificationDate = parseOxiDate(row["Fecha Integración Bases"]);
  const governmentLevel = LEVEL_BY_NIVEL[row["Nivel de Gobierno"]?.trim() ?? ""] ?? "federal";
  const estimatedValue = parseOxiAmount(row["Monto Convocatoria (S/)"]);
  const now = new Date().toISOString();

  // Every convocatoria in this export is a public work being built by a
  // private party — "works" for all of them, including the supervision
  // contracts, whose subject is still the works. The supervision rule in
  // lib/relevance.ts keys on the title text, not on scopeType.
  const scopeType = "works" as const;

  const { industries, relevance } = classifyStoredTender({
    title,
    summary: title,
    buyer,
    country: "Peru",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency: estimatedValue ? "PEN" : undefined,
    sourceName,
  });

  const keyDates: TenderKeyDate[] = [
    { id: `peru-oxi-${tenderNumber}-publication`, type: "publication", date: publicationDate },
  ];
  if (clarificationDate) {
    keyDates.push({ id: `peru-oxi-${tenderNumber}-clarification`, type: "clarification", date: clarificationDate });
  }
  if (submissionDeadline) {
    keyDates.push({ id: `peru-oxi-${tenderNumber}-submission`, type: "submission", date: submissionDeadline });
  }

  const isSupervision = (row["Tipo de Convocatoria"] ?? "").includes("Supervisora");

  return {
    id: crypto.randomUUID(),
    slug: `peru-oxi-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Peru",
    governmentLevel,
    industries,
    scopeType,
    procedureType: row["Tipo de Convocatoria"]?.trim() || "Obras por Impuestos",
    publicationDate,
    submissionDeadline,
    estimatedValue,
    currency: estimatedValue ? "PEN" : undefined,
    location: row.Departamento?.trim() || undefined,
    // Every row in this export is "En Proceso"; a convocatoria that closes
    // drops out of the export rather than changing state inside it.
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [
      {
        id: `peru-oxi-${tenderNumber}-mechanism`,
        level: "medium",
        title: untranslated("Obras por Impuestos（税收抵扣工程）机制"),
        description: untranslated(
          "本项目通过秘鲁 Obras por Impuestos（Ley N° 29230）机制招标：中标的私营企业先行垫资建设，之后以其在秘鲁应缴的所得税抵扣工程款，因此投标主体需为秘鲁纳税主体。" +
            (isSupervision
              ? "本条为监理（Entidad Privada Supervisora）标，不是施工标。"
              : "本条为出资并施工方（Empresa Privada）标。") +
            "具体投标资格、联合体安排与分包空间以该项目招标文件（Bases）为准。",
        ),
        sourceReference: row["Código Único de Inversiones (CUI)"]?.trim()
          ? `CUI ${row["Código Único de Inversiones (CUI)"]!.trim()}`
          : undefined,
      },
    ],
    relevance,
    sourceName,
    // No per-convocatoria deep link in the export — the Enlace columns are
    // label text ("Enlace Portal"), not URLs, so this points at the real
    // searchable listing rather than inventing a URL pattern.
    sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
