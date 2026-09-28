/**
 * What the wire documents' font can print. The proforma invoice and service
 * agreement use the PDF standard Helvetica, which covers printable ASCII and
 * Latin-1 (accented Spanish and Portuguese included) plus a few typographic
 * marks — not Chinese. Embedding a CJK font would add megabytes to every
 * document, and the documents are English anyway, so a wire order asks for
 * its name and address in English or pinyin instead. Shared by the checkout
 * form, the wire route and the PDF builder so all three agree.
 */
const PDF_LATIN = /^[\x20-\x7E -ÿ–—‘’“”…€]*$/;

export function isPdfLatinText(value: string | null | undefined): boolean {
  return PDF_LATIN.test(value ?? "");
}
