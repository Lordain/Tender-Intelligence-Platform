import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { ComprasMxContractRow } from "@/lib/ingestion/compras-mx-contracts-mapper";

/**
 * Reads a locally-downloaded Compras MX "Datos Abiertos" contracts CSV.
 * Real files the user provided arrived re-encoded as GB18030 (evidently
 * round-tripped through a Chinese-locale tool at some point — plain UTF-8
 * decode throws on byte 0xa8), rather than the UTF-8 a government CSV
 * export would normally use. Node's built-in TextDecoder handles GB18030
 * directly (verified), so we try UTF-8 first (the "should be" case) and
 * fall back to GB18030 only if that throws, rather than assuming either.
 */
export function readComprasMxContractsFile(filePath: string): ComprasMxContractRow[] {
  const buffer = readFileSync(filePath);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    content = new TextDecoder("gb18030").decode(buffer);
  }

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    // The real full 2025 file (23,597 rows) has at least one unquoted
    // field with an embedded literal quote —
    // `HOSPITAL GENERAL DE MéXICO "DR. EDUARDO LICEAGA"` in `Institución`,
    // not RFC4180-escaped — which strict csv-parse rejects outright
    // (Invalid Opening Quote), aborting the whole file after 48 rows.
    // Confirmed relax_quotes parses all 23,597 rows correctly, including
    // that institution name intact.
    relax_quotes: true,
  }) as ComprasMxContractRow[];
}
