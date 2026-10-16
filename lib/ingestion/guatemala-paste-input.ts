/** Request-body cleaning for the 危地马拉 tab's two paste routes (app/api/admin/screen-guatemala-list, app/api/admin/import-guatemala-paste). */
import { GUATECOMPRAS_ORIGIN, type GuatecomprasLink } from "@/lib/ingestion/guatemala-paste-result";

const MAX_LINKS = 2_000;

/** Links as the browser sent them, kept only for Guatecompras's own site and a NOG-shaped number. */
export function cleanGuatecomprasLinks(raw: unknown): GuatecomprasLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LINKS)
    .filter(
      (link): link is GuatecomprasLink =>
        typeof link?.nog === "string" && /^\d{5,12}$/.test(link.nog) && typeof link?.url === "string" && link.url.startsWith(`${GUATECOMPRAS_ORIGIN}/`),
    )
    .map((link) => ({ nog: link.nog, url: link.url.slice(0, 1000) }));
}
