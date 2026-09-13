import { writeFileSync } from "node:fs";

/**
 * Writes a small, genuinely valid multi-page PDF — real enough for
 * poppler (`pdfinfo`/`pdftotext`/`pdfseparate`, which the extraction
 * pipeline shells out to) to read page counts and a text layer from it.
 *
 * Exists so the extraction pipeline can be exercised end to end offline.
 * The alternative — a checked-in real tender PDF — would be tens of MB of
 * binary in git, and a synthetic one lets a test state exactly how many
 * pages and how many bytes a case needs (the chunking and page-cap paths
 * are both decided by those two numbers alone).
 */
export function writeTestPdf(path: string, options: { pages: number; lineText?: string; padBytes?: number }): void {
  const { pages, lineText = "CRONOGRAMA", padBytes = 0 } = options;
  const objects: string[] = [];
  const kids: string[] = [];

  // 1 = catalog, 2 = pages, 3 = font; page/content objects start at 4.
  for (let i = 0; i < pages; i += 1) {
    const pageObj = 4 + i * 2;
    kids.push(`${pageObj} 0 R`);
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (let i = 0; i < pages; i += 1) {
    const pageObj = 4 + i * 2;
    const contentObj = pageObj + 1;
    const stream = `BT /F1 12 Tf 72 720 Td (${lineText} page ${i + 1}) Tj ET`;
    objects[pageObj - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[contentObj - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  // Padding rides in a comment so the file can be made arbitrarily large
  // (the size-based chunking limits are byte-driven) without changing the
  // page count or the text layer.
  if (padBytes > 0) body += `% ${"P".repeat(padBytes)}\n`;

  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  writeFileSync(path, body, "latin1");
}
