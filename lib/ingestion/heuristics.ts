import type { GovernmentLevel } from "@/types/tender";

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
