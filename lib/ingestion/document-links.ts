/**
 * Reads and writes `tender_document_links` — the official download URLs for a
 * tender's bid documents, discovered during ingestion.
 *
 * See supabase/migrations/0042_tender_document_links.sql for why these are a
 * separate table from `tender_documents` (short version: a row in
 * `tender_documents` means "we hold this file", and /admin/documents-needed
 * treats one as "this tender is handled" — so a discovered link written there
 * would empty the worklist without anything having been downloaded).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderDocumentLink } from "@/lib/ingestion/peru-oece-mapper";

export type DocumentLinksForSlug = { slug: string; links: TenderDocumentLink[] };

export type SaveDocumentLinksResult = {
  /** Slugs that carried at least one link AND resolved to a stored tender. */
  tendersWithLinks: number;
  linkCount: number;
  /** Slugs whose links were dropped because no tender with that slug is stored — normal for an "excluded" row, which is never written (see upsert-tenders.ts). */
  unmatchedSlugs: number;
  failed: { slug: string; error: string }[];
};

const SELECT_PAGE_SIZE = 500;

/** PostgREST caps `in.(...)` by URL length long before it caps by row count; 200 slugs keeps the request comfortably inside it. */
const SLUG_LOOKUP_CHUNK = 200;

async function tenderIdsBySlug(supabase: SupabaseClient, slugs: string[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let from = 0; from < slugs.length; from += SLUG_LOOKUP_CHUNK) {
    const chunk = slugs.slice(from, from + SLUG_LOOKUP_CHUNK);
    const { data, error } = await supabase.from("tenders").select("id, slug").in("slug", chunk);
    if (error) throw new Error(`Failed to look up tender ids: ${error.message}`);
    for (const row of (data ?? []) as { id: string; slug: string }[]) ids.set(row.slug, row.id);
  }
  return ids;
}

/**
 * Records the links for already-upserted tenders.
 *
 * Upsert on (tender_id, source_url), so re-ingesting the same month is a
 * no-op rather than a duplicate pile. Links are never deleted here: a
 * document that disappears from a later OCDS re-compile was still genuinely
 * published, and the download route reports a dead URL per row anyway.
 */
export async function saveDocumentLinks(
  supabase: SupabaseClient,
  entries: DocumentLinksForSlug[],
): Promise<SaveDocumentLinksResult> {
  const withLinks = entries.filter((entry) => entry.links.length > 0);
  const result: SaveDocumentLinksResult = { tendersWithLinks: 0, linkCount: 0, unmatchedSlugs: 0, failed: [] };
  if (withLinks.length === 0) return result;

  const ids = await tenderIdsBySlug(supabase, withLinks.map((entry) => entry.slug));

  const rows: Record<string, unknown>[] = [];
  for (const entry of withLinks) {
    const tenderId = ids.get(entry.slug);
    if (!tenderId) {
      result.unmatchedSlugs += 1;
      continue;
    }
    result.tendersWithLinks += 1;
    for (const link of entry.links) {
      rows.push({
        tender_id: tenderId,
        source_url: link.sourceUrl,
        file_name: link.fileName,
        document_type: link.documentType ?? null,
        format: link.format ?? null,
        published_at: link.publishedAt ?? null,
      });
    }
  }

  const BATCH = 500;
  for (let from = 0; from < rows.length; from += BATCH) {
    const batch = rows.slice(from, from + BATCH);
    const { error } = await supabase
      .from("tender_document_links")
      .upsert(batch, { onConflict: "tender_id,source_url", ignoreDuplicates: false });
    if (error) {
      result.failed.push({ slug: String(batch[0]?.file_name ?? "batch"), error: error.message });
      continue;
    }
    result.linkCount += batch.length;
  }

  return result;
}

export type StoredDocumentLink = TenderDocumentLink & { slug: string };

/** Every known link for the given tender slugs, in one round trip per page. */
export async function fetchDocumentLinksForSlugs(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<Map<string, StoredDocumentLink[]>> {
  const bySlug = new Map<string, StoredDocumentLink[]>();
  if (slugs.length === 0) return bySlug;

  const ids = await tenderIdsBySlug(supabase, slugs);
  const slugById = new Map([...ids].map(([slug, id]) => [id, slug]));
  const tenderIds = [...ids.values()];
  if (tenderIds.length === 0) return bySlug;

  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tender_document_links")
      .select("tender_id, source_url, file_name, document_type, format, published_at")
      .in("tender_id", tenderIds)
      .order("published_at", { ascending: true })
      .range(from, from + SELECT_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read tender_document_links: ${error.message}`);

    const page = (data ?? []) as {
      tender_id: string;
      source_url: string;
      file_name: string;
      document_type: string | null;
      format: string | null;
      published_at: string | null;
    }[];

    for (const row of page) {
      const slug = slugById.get(row.tender_id);
      if (!slug) continue;
      const list = bySlug.get(slug) ?? [];
      list.push({
        slug,
        sourceUrl: row.source_url,
        fileName: row.file_name,
        documentType: row.document_type ?? undefined,
        format: row.format ?? undefined,
        publishedAt: row.published_at ?? undefined,
      });
      bySlug.set(slug, list);
    }

    if (page.length < SELECT_PAGE_SIZE) break;
  }

  return bySlug;
}
