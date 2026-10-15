/** Request-body cleaning for the 乌拉圭 tab's two paste routes (app/api/admin/screen-uruguay-list, app/api/admin/import-uruguay-paste). */
import type { ArceDocLink, ArceLink } from "@/lib/ingestion/uruguay-paste-result";

const MAX_LINKS = 2_000;

/** Links as the browser sent them, kept only when they have the shape the forms produce. */
export function cleanArceLinks(raw: unknown): ArceLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LINKS)
    .filter((link): link is ArceLink => typeof link?.purchaseId === "string" && /^\d{1,12}$/.test(link.purchaseId) && typeof link?.label === "string")
    .map((link) => ({ label: link.label.slice(0, 500), purchaseId: link.purchaseId }));
}

/** Document links, kept only for ARCE's own site. */
export function cleanArceDocuments(raw: unknown): ArceDocLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 200)
    .filter((doc): doc is ArceDocLink => typeof doc?.title === "string" && typeof doc?.url === "string" && /^https:\/\/(www\.)?comprasestatales\.gub\.uy\//i.test(doc.url))
    .map((doc) => ({ title: doc.title.slice(0, 300), url: doc.url.slice(0, 1000) }));
}
