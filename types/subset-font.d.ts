// subset-font ships no types; this is the one call lib/billing/wire-documents.ts makes.
declare module "subset-font" {
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: { targetFormat?: "sfnt" | "truetype" | "woff" | "woff2" },
  ): Promise<Buffer>;
}
