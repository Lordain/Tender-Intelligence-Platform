/**
 * Works out which already-ingested tender a downloaded document belongs to.
 *
 * Extracted from scripts/analyze-batch.ts (2026-09-11) so the local batch
 * tool (lib/ingestion/analyze-local-folder.ts) matches documents exactly the
 * way the CLI does. Two copies of this would drift, and a document silently
 * filed against the wrong tender is worse than one that fails to match.
 *
 * Matching is against real, already-known `tenders.tender_number` values
 * rather than a guessed per-source regex shape — see analyze-batch.ts's own
 * header for the PEMEX and CFE numbers that broke the regex approach.
 */
import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderRelevanceTier } from "@/types/tender";
import { extractDocumentText, intakeDocument } from "@/lib/ingestion/document-intake";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

export function findDocuments(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && SUPPORTED_EXTENSIONS.includes(extname(path).toLowerCase()))
    .sort();
}

export type ResolvedTender = { slug: string; title: string; buyer: string; tenderNumber: string; tier: TenderRelevanceTier | null; matchNote: string };
export type KnownTender = { slug: string; title: string; buyer: string; tier: TenderRelevanceTier | null };

/** A recognized `<slug>__` file name prefix (e.g. `dof-5678901__bases.pdf`) looks the tender up directly by slug — see this file's header comment for the (currently theoretical) case that needs this instead of text matching. */
const SLUG_OVERRIDE_PATTERN = /^([a-z0-9-]+)__/;

/**
 * Every real tender_number currently in Supabase, fetched once per run —
 * this is the "known facts" a document's own text/file name gets checked
 * against, rather than a guessed regex shape (see header comment). Paged
 * via `.range()` since a real production count can exceed PostgREST's
 * 1000-row default cap (the PEMEX ingest alone kept 3,128 real rows).
 */
export async function loadKnownTenders(supabase: SupabaseClient): Promise<Map<string, KnownTender>> {
  const known = new Map<string, KnownTender>();
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("tenders").select("slug, tender_number, title, buyer, relevance_tier").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load known tender numbers: ${error.message}`);
    for (const row of data ?? []) {
      const tenderNumber = row.tender_number as string;
      if (tenderNumber) {
        known.set(tenderNumber.toUpperCase(), { slug: row.slug as string, title: (row.title as { zh: string }).zh, buyer: row.buyer as string, tier: (row.relevance_tier as TenderRelevanceTier | null) ?? null });
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return known;
}

export async function resolveTender(
  supabase: SupabaseClient,
  pdfPath: string,
  knownTenders: Map<string, KnownTender>,
): Promise<{ tender: ResolvedTender } | { skip: string }> {
  const fileName = basename(pdfPath);
  const slugOverride = fileName.match(SLUG_OVERRIDE_PATTERN)?.[1];

  if (slugOverride) {
    const { data } = await supabase.from("tenders").select("slug, tender_number, title, buyer, relevance_tier").eq("slug", slugOverride).maybeSingle();
    if (!data) return { skip: `${fileName} — filename names slug "${slugOverride}" but no tender in Supabase has it` };
    return {
      tender: {
        slug: data.slug as string,
        tenderNumber: data.tender_number as string,
        title: (data.title as { zh: string }).zh,
        buyer: data.buyer as string,
        tier: (data.relevance_tier as TenderRelevanceTier | null) ?? null,
        matchNote: `filename slug override (${slugOverride})`,
      },
    };
  }

  // Check the file name first (cheap, and a human-chosen name is
  // higher-confidence than a regex frequency count), then the document's
  // own extracted text. Prefer the LONGEST matching known number if more
  // than one appears — a document naming its own procedure plus a couple
  // of others it references should still resolve to its own.
  const text = await extractDocumentText(pdfPath);
  const haystack = `${fileName}\n${text}`.toUpperCase();
  let bestMatch: string | undefined;
  for (const tenderNumber of knownTenders.keys()) {
    if (haystack.includes(tenderNumber) && (!bestMatch || tenderNumber.length > bestMatch.length)) bestMatch = tenderNumber;
  }

  if (bestMatch) {
    const known = knownTenders.get(bestMatch)!;
    return { tender: { ...known, tenderNumber: bestMatch, matchNote: `matched known tender_number ${bestMatch} in file name/text` } };
  }

  // Fall back to the old Compras MX-shaped regex extraction — still useful
  // for a document whose tender genuinely isn't in Supabase yet, or a
  // shape the known-numbers check happened to miss (e.g. OCR noise).
  const intake = await intakeDocument(pdfPath);
  if (!intake.tenderNumber) {
    return {
      skip: `${fileName} — no known tender_number found in its file name/text, and no Compras MX-shaped procedure number either (rename it "<slug>__..." if you know which tender it belongs to)`,
    };
  }
  const { data } = await supabase.from("tenders").select("slug, title, buyer, relevance_tier").eq("tender_number", intake.tenderNumber).maybeSingle();
  if (!data) return { skip: `${fileName} — extracted procedure number ${intake.tenderNumber}, but no ingested tender has it` };

  return {
    tender: {
      slug: data.slug as string,
      tenderNumber: intake.tenderNumber,
      title: (data.title as { zh: string }).zh,
      buyer: data.buyer as string,
      tier: (data.relevance_tier as TenderRelevanceTier | null) ?? null,
      matchNote:
        intake.tenderNumberSource === "filename" ? "procedure number from file name (regex fallback)" : `procedure number appears ${intake.tenderNumberOccurrences}x in the text (regex fallback)`,
    },
  };
}
