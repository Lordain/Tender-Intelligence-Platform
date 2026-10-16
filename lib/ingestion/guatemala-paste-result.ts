/**
 * What the 危地马拉 tab's two paste steps send and get back
 * (lib/ingestion/import-guatemala-paste.ts). Client-safe: the forms import
 * it without the classifier.
 */

export const GUATECOMPRAS_ORIGIN = "https://www.guatecompras.gt";
export const GUATECOMPRAS_VIGENTES_URL = `${GUATECOMPRAS_ORIGIN}/concursos/consultaConcursos.aspx`;

/** A call's NOG and the address its link in the copied page pointed to. */
export type GuatecomprasLink = { nog: string; url: string };

/**
 * The detail links a copied Guatecompras page carries in its HTML. Each
 * concurso links to its own page by NOG; the plain text has the NOG but not
 * the address, which is taken from here rather than guessed.
 */
export function extractGuatecomprasLinks(html: string): GuatecomprasLink[] {
  const links: GuatecomprasLink[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']*?[?&](?:amp;)?nog=(\d{5,12})[^"']*)["']/gi)) {
    const nog = match[2];
    if (seen.has(nog)) continue;
    let url = match[1].replace(/&amp;/g, "&");
    try {
      url = new URL(url, `${GUATECOMPRAS_ORIGIN}/concursos/`).toString();
    } catch {
      continue;
    }
    if (!url.startsWith(GUATECOMPRAS_ORIGIN)) continue;
    seen.add(nog);
    links.push({ nog, url });
  }
  return links;
}

/**
 * The address a call's page is assumed to have when the copied page brought
 * no link for it. Not confirmed from here (Guatecompras challenges our
 * servers); the first real paste with links shows whether it holds.
 */
export function guatecomprasCallUrl(nog: string): string {
  return `${GUATECOMPRAS_ORIGIN}/concursos/consultaConcurso.aspx?nog=${nog}`;
}

export type GuatemalaPasteOutcome = "write" | "short_window" | "manual_keep" | "excluded" | "closed" | "not_open" | "exists";

export type GuatemalaKeepTier = "flagship" | "significant" | "standard";
export const GUATEMALA_KEEP_TIERS: readonly GuatemalaKeepTier[] = ["standard", "significant", "flagship"];

export type GuatemalaPasteRow = {
  nog: string;
  url: string;
  title: string;
  buyer: string;
  /** Gobiernos locales — excluded by the user's rule A. */
  municipal: boolean;
  publicationDate?: string;
  submissionDeadline?: string;
  tier: string;
  reasonZh: string;
  /** The tier the rules gave, before any manual keep. */
  ruleTier: string;
  outcome: GuatemalaPasteOutcome;
  outcomeZh: string;
  existingSlug?: string;
};

export type GuatemalaPasteResponse = {
  rows: GuatemalaPasteRow[];
  /** Calls of a modality outside the reach (Compra Directa, Cotización, …), by modality. */
  notRead: { modality: string; count: number }[];
};

export type GuatemalaDetailPaste = { text: string; links: GuatecomprasLink[] };

export type GuatemalaDetailRow = GuatemalaPasteRow & { keyDates: number; snip: boolean; bonds: string | null };

export type GuatemalaDetailResponse = {
  rows: GuatemalaDetailRow[];
  written?: number;
  failed?: { slug: string; error: string }[];
};
