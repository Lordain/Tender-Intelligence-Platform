import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { worldBankCountryRows } from "@/lib/ingestion/ingest-worldbank";
import { WORLDBANK_COUNTRIES } from "@/lib/ingestion/worldbank-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { revalidateTenders } from "@/lib/cache-tags";
import { logAdminAlert } from "@/lib/admin-alerts";
import type { WorldBankReviewRow } from "@/lib/ingestion/worldbank-review-result";

/**
 * The admin 世界银行 tab (user, 2026-10-09: 可能的进后台待审). Preview lists
 * the open calls of the last 60 days the daily job held back because they
 * resemble a stored row from another source, and those it writes; write
 * stores the ones the admin ticked — only calls the job would write or held
 * back for review, never one matched as a duplicate. The general rules still
 * decide in upsertTendersBatched().
 */
export const maxDuration = 300;
const DAYS = 60;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { write?: boolean; ids?: string[] };
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const now = new Date();
    const rows: WorldBankReviewRow[] = [];
    const writable = new Map<string, Parameters<typeof upsertTendersBatched>[1][number]>();
    for (const country of Object.keys(WORLDBANK_COUNTRIES)) {
      const result = await worldBankCountryRows(supabase, country, { days: DAYS, now });
      for (const row of result.rows) {
        if (row.outcome === "closed" || row.outcome === "excluded") continue;
        if (row.outcome === "review" || row.outcome === "write") writable.set(row.notice.id, row.tender);
        rows.push({
          id: row.notice.id,
          country,
          tenderNumber: row.tender.tenderNumber ?? row.notice.id,
          title: row.tender.title.es,
          buyer: row.tender.buyer,
          submissionDeadline: row.tender.submissionDeadline,
          tier: row.tender.relevance.tier,
          outcome: row.outcome,
          ...(row.match ? { matchSlug: row.match.candidate.slug, matchTitle: row.match.candidate.title, matchSource: row.match.candidate.sourceName ?? undefined, matchKind: row.match.kind } : {}),
          sourceUrl: row.tender.sourceUrl ?? "",
        });
      }
    }
    if (body.write !== true) return NextResponse.json({ rows });
    const chosen = (body.ids ?? []).map((id) => writable.get(id)).filter((tender): tender is NonNullable<typeof tender> => !!tender);
    const result = await upsertTendersBatched(supabase, chosen);
    revalidateTenders();
    return NextResponse.json({ rows, written: result.upsertedCount, failed: result.failed });
  } catch (err) {
    if (body.write === true) await logAdminAlert(supabase, "worldbank-review", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
