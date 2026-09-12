/**
 * Takes a tender OFF the manual-deletion block list, so the next import can
 * bring it back.
 *
 * tender_manual_deletions (migration 0014) is how "delete this tender" stays
 * deleted: upsert-tenders.ts filters every slug on it out before the insert,
 * on every import, forever. That is the right default — an admin's decision
 * should not be silently undone by the next re-ingest — but until now it was
 * a ONE-WAY door with no read path and no undo anywhere in the codebase, so a
 * row deleted under an older ruleset, or by a mis-clicked bulk delete, was
 * invisible and unrecoverable, and no screen said it existed.
 *
 * Found for real on 2026-09-12: check:colombia reported 26 Colombia tenders
 * the rules would keep but the database did not have — among them a water
 * treatment plant, a municipal aqueduct and several road projects, all
 * flagship or significant — while the same session's import log said
 * "Skipping 22 tender(s) an admin previously deleted".
 *
 * Deleting the row here does NOT re-insert the tender. It only stops the
 * block; the next import of that source writes it again.
 *
 * Usage:
 *   npm run restore:deleted                          (list what is blocked)
 *   npm run restore:deleted -- --country Colombia    (list, filtered by slug prefix/substring)
 *   npm run restore:deleted -- <slug> [<slug>...]    (unblock those)
 *   npm run restore:deleted -- --all-matching secop  (unblock every blocked slug containing "secop")
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type DeletionRow = { slug: string; tender_number: string | null; title: string | null; deleted_at: string };

async function main() {
  const args = process.argv.slice(2);
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const matchIdx = args.indexOf("--all-matching");
  const matching = matchIdx >= 0 ? args[matchIdx + 1] : undefined;
  const filterIdx = args.indexOf("--country");
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
  const slugs = args.filter((a) => !a.startsWith("--") && a !== matching && a !== filter);

  const { data, error } = await supabase
    .from("tender_manual_deletions")
    .select("slug, tender_number, title, deleted_at")
    .order("deleted_at", { ascending: false });
  if (error) {
    console.error(`Could not read tender_manual_deletions: ${error.message}`);
    process.exit(1);
  }
  const blocked = (data ?? []) as DeletionRow[];

  // Listing mode — no slugs given. Deliberately the DEFAULT, because the
  // whole problem was that nothing could show this list.
  if (slugs.length === 0 && !matching) {
    const shown = filter ? blocked.filter((r) => r.slug.toLowerCase().includes(filter.toLowerCase())) : blocked;
    console.log(`${shown.length} tender(s) are blocked from re-import${filter ? ` (slug contains "${filter}")` : ""}:\n`);
    for (const row of shown) {
      console.log(`  ${row.deleted_at.slice(0, 10)}  ${row.slug}`);
      if (row.title) console.log(`              ${row.title.slice(0, 90)}`);
    }
    if (shown.length > 0) {
      console.log(`\nTo let one back in:  npm run restore:deleted -- ${shown[0].slug}`);
      console.log("Then re-run that source's import — this only removes the block, it does not re-insert anything.");
    }
    return;
  }

  const targets = matching
    ? blocked.filter((r) => r.slug.toLowerCase().includes(matching.toLowerCase())).map((r) => r.slug)
    : slugs;

  const known = new Set(blocked.map((r) => r.slug));
  const unknown = targets.filter((slug) => !known.has(slug));
  const real = targets.filter((slug) => known.has(slug));

  for (const slug of unknown) console.error(`  not on the block list (nothing to do): ${slug}`);
  if (real.length === 0) {
    console.log("Nothing to unblock.");
    return;
  }

  const { error: deleteError } = await supabase.from("tender_manual_deletions").delete().in("slug", real);
  if (deleteError) {
    console.error(`Failed to unblock: ${deleteError.message}`);
    process.exit(1);
  }
  console.log(`Unblocked ${real.length} tender(s):`);
  for (const slug of real) console.log(`  ${slug}`);
  console.log("\nThey are NOT back yet — re-run that source's import and it will write them again.");
}

main();
