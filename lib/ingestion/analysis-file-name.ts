const UNSAFE_PATH_CHARS = /[\\/:*?"<>|]/g;

function zipSafe(segment: string): string {
  return segment.replace(UNSAFE_PATH_CHARS, "-").trim().slice(0, 120) || "unnamed";
}

/**
 * The file name the analysis pipeline can resolve without opening the file.
 *
 * lib/ingestion/match-documents-to-tenders.ts resolves a document to its
 * tender in three steps, and the FIRST one is a `<slug>__` file-name prefix
 * (SLUG_OVERRIDE_PATTERN) — an exact lookup, no text extraction, no
 * ambiguity. Without the prefix these files would fall through to step two,
 * "does any known tender_number appear in the name or the extracted text",
 * and the name alone says nothing: every one of them is called "Bases
 * Administrativas.pdf". They would still usually resolve off the PDF's own
 * text, but only after extracting it, and only if SEACE's own document
 * happens to spell the procedure number the way the record does.
 *
 * So the ZIP is flat and every entry is `<slug>__<document name>`. Flat
 * because findDocuments() does not recurse: an admin who unzipped and pointed
 * /admin/local-batch at the folder would have got "0 files found" from a
 * folder visibly full of PDFs.
 */
export function analysisFileName(slug: string, fileName: string): string {
  return `${zipSafe(slug)}__${zipSafe(fileName)}`;
}
