import type { GovernmentLevel, TenderParticipationScope } from "@/types/tender";

const GOVERNMENT_LEVEL_PATTERNS: [RegExp, GovernmentLevel][] = [
  [/municipio|ayuntamiento/i, "municipal"],
  [/gobierno del estado|secretar[íi]a de.*estado/i, "state"],
  [/^cfe$|comisión federal de electricidad|^pemex$|petróleos mexicanos|imss|isste/i, "public_company"],
  [/secretar[íi]a|instituto nacional|federal/i, "federal"],
];

/** Best-effort heuristic from the buyer name — neither OCDS nor the CompraNet 5.0 historical export has a government-level field. Flag for human review, don't trust blindly. */
export function inferGovernmentLevel(buyerName: string): GovernmentLevel {
  for (const [pattern, level] of GOVERNMENT_LEVEL_PATTERNS) {
    if (pattern.test(buyerName)) return level;
  }
  return "federal";
}

/**
 * Officially documented in DD_PIC_CONTRATOS_2400703.xlsx (the real Datos
 * Relevantes del Contrato data dictionary the user provided): the
 * "Número de procedimiento" field is structured as
 * `XX-##-XXX-XXXXXXXXX-X-#-####`, where the second hyphen-delimited
 * component is "Clave del ramo" — 02–51 is Administración Pública Federal
 * (APF/federal), 60–91 is Gobierno Estatal y/o Municipal (GEM). The same
 * document format ("NÚMERO DE IDENTIFICACIÓN") appears in the "Difusión de
 * procedimientos" export, which otherwise has no government-level field at
 * all.
 *
 * Verified, not just documented: checked against the full real 23,597-row
 * 2025 contracts file, which carries BOTH this field and the ground-truth
 * "Orden de gobierno" column — this extraction predicted the correct
 * orden de gobierno for all 23,552 rows where it could be extracted
 * (100%), only failing to parse on 45 rows with a non-standard procedure
 * number shape (falls back to the buyer-name heuristic for those, same as
 * a genuinely missing procedure number).
 *
 * Mirrors `inferGovernmentLevelFromOrden` in compras-mx-contracts-mapper.ts
 * (GEM collapses state/municipal/paramunicipal into "state", matching that
 * function's convention) but derived from the procedure number instead of
 * a direct "Orden de gobierno" column, for sources that don't have one.
 */
export function inferGovernmentLevelFromProcedureNumber(
  numeroProcedimiento: string | undefined,
  buyerName: string,
): GovernmentLevel {
  const ramo = Number(numeroProcedimiento?.split("-")[1]);
  if (Number.isInteger(ramo)) {
    if (ramo >= 2 && ramo <= 51) return "federal";
    if (ramo >= 60 && ramo <= 91) return "state";
  }
  return inferGovernmentLevel(buyerName);
}

const PARTICIPATION_SCOPE_BY_CARACTER: Record<string, TenderParticipationScope> = {
  NACIONAL: "national",
  "INTERNACIONAL BAJO LA COBERTURA DE TRATADOS": "international_treaty",
  "INTERNACIONAL ABIERTO": "international_open",
};

/**
 * "Carácter del procedimiento" — confirmed identical real values in both
 * the contracts export (16,896 NACIONAL / 5,420 INTERNACIONAL ABIERTO /
 * 1,281 INTERNACIONAL BAJO LA COBERTURA DE TRATADOS, out of the full
 * 23,597-row 2025 file) and the open-tenders export. An exact lookup, not
 * a guess — returns undefined rather than a wrong default for anything
 * unrecognized, since this field is optional in the schema precisely so a
 * source that doesn't carry it (or a value that doesn't match) just omits
 * it instead of asserting something unverified.
 */
export function inferParticipationScope(caracter: string | undefined): TenderParticipationScope | undefined {
  if (!caracter) return undefined;
  return PARTICIPATION_SCOPE_BY_CARACTER[caracter.toUpperCase().trim()];
}
