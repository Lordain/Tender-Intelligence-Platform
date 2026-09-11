/**
 * Marks hand-corrected `source_url` values as manually overridden, so the next
 * import cannot silently put the generic fallback back.
 *
 * Why this exists (2026-09-11): the user filled in the real per-procedure
 * links for the Proyectos Estratégicos MX rows by hand. upsert-tenders.ts
 * already protects hand-edited columns — but only ones recorded in
 * `manual_field_overrides`, which is filled in by the admin edit API
 * (app/api/admin/tenders/[slug]) as it diffs a save. A row edited straight in
 * Supabase's own table editor carries no such record, so the very next
 * `ingest:proyectos-estrategicos` run would overwrite every one of those links
 * with the source's generic site URL and the work would be gone.
 *
 * So this looks for rows whose stored source_url is NOT what the importer
 * would produce, and which are not yet protected, and adds "source_url" to
 * their overrides. Idempotent, and never removes a protection.
 *
 * Usage:
 *   npm run protect:source-urls               (dry run — lists what it would lock)
 *   npm run protect:source-urls -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

/**
 * What each source's mapper writes when it has no per-tender link. A stored
 * value different from these is, by definition, not something the importer
 * produced.
 */
const IMPORTER_FALLBACK_URLS = [
  "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/",
  "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/",
  "https://www.investinperu.pe/inversiones-seleccion-oxi/",
  "https://contratacionesabiertas.oece.gob.pe/",
];

async function main() {
  const write = process.argv.slice(2).includes("--write");
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("tenders")
    .select("slug, source_name, source_url, manual_field_overrides");
  if (error) {
    console.error(`Failed to query tenders: ${error.message}`);
    process.exit(1);
  }

  const candidates = (data ?? []).filter((row) => {
    const url = (row.source_url as string | null) ?? "";
    if (!url) return false;
    if (IMPORTER_FALLBACK_URLS.includes(url)) return false;
    return !((row.manual_field_overrides as string[] | null) ?? []).includes("source_url");
  });

  const bySource = new Map<string, number>();
  for (const row of candidates) {
    const name = (row.source_name as string) ?? "(unknown)";
    bySource.set(name, (bySource.get(name) ?? 0) + 1);
  }

  console.log(`${candidates.length} tender(s) carry a source_url the importer would not produce and are not yet protected:`);
  for (const [name, count] of [...bySource].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${name}`);
  }
  for (const row of candidates.slice(0, 5)) console.log(`        e.g. ${row.slug} -> ${row.source_url}`);

  if (!write) {
    console.log("\ndry run (pass --write to add source_url to manual_field_overrides) — nothing was written.");
    return;
  }

  let updated = 0;
  for (const row of candidates) {
    const overrides = [...new Set([...(((row.manual_field_overrides as string[] | null) ?? [])), "source_url"])].sort();
    const { error: updateError } = await supabase
      .from("tenders")
      .update({ manual_field_overrides: overrides })
      .eq("slug", row.slug as string);
    if (updateError) {
      console.error(`  ${row.slug}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  console.log(`\nProtected ${updated} of ${candidates.length} tender(s).`);
}

main();
