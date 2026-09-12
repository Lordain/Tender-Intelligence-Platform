/**
 * One-off backfill for `syncKeyDatesForTopLevelFields()` (lib/db/key-
 * dates-sync.ts) — that fix only runs when an admin tender route (create/
 * update) actually fires, so every tender whose publication_date/
 * submission_deadline/award_date was ever set BEFORE that fix landed
 * keeps a stale (or missing) matching row in tender_key_dates until
 * something re-saves it. Real report, 2026-09-05: the user has "很多"
 * (many) Colombia tenders showing this exact drift (计划交标 correct on
 * the overview card, 关键日期 timeline still missing/stale) and can't
 * click "保存修改" on each one by hand.
 *
 * Not scoped to Colombia — the underlying bug (admin routes never
 * touching tender_key_dates at all) applied to every tender's admin-
 * edited dates, any country, any source. Running this against every
 * tender is safe and idempotent: a tender whose key dates already match
 * just gets the same values deleted and re-inserted.
 *
 * Usage:
 *   npm run backfill:key-dates-sync               (dry run — report only)
 *   npm run backfill:key-dates-sync -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { syncKeyDatesForTopLevelFields } from "../lib/db/key-dates-sync";

type Row = {
  id: string;
  slug: string;
  publication_date: string | null;
  submission_deadline: string | null;
  award_date: string | null;
};

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const PAGE_SIZE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, slug, publication_date, submission_deadline, award_date")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Failed to list tenders: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`${rows.length} tender(s) found.`);
  if (!shouldWrite) {
    console.log("dry run (pass --write to actually sync tender_key_dates) — nothing was written.");
    return;
  }

  let done = 0;
  for (const row of rows) {
    await syncKeyDatesForTopLevelFields(supabase, row.id, {
      publicationDate: row.publication_date,
      submissionDeadline: row.submission_deadline,
      awardDate: row.award_date,
    });
    done++;
    if (done % 200 === 0) console.log(`  synced ${done}/${rows.length}...`);
  }

  console.log(`Synced tender_key_dates for ${done} tender(s).`);
}

main();
