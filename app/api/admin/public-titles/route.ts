import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { generateDisplayText } from "@/lib/ingestion/generate-public-titles";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * Web-form counterpart to `npm run titles:public` (step ② of the 更新项目文案
 * panel on app/admin/import-tenders/maintenance/page.tsx) — same shared
 * lib/ingestion/generate-public-titles.ts function the CLI script uses.
 *
 * Still a SEPARATE endpoint from /api/admin/translate-tenders, and the panel
 * being one button since 2026-09-20 does not change that. It calls the two in
 * order from the browser instead. Both reasons this was written for hold, and
 * the client-side sequence honours them:
 *
 *  - the wall time. Chaining the passes INSIDE one request would double the
 *    length of a request that already has to stay under a proxy timeout; two
 *    requests are each as long as they are today;
 *  - the row counts. The passes select different rows — that one takes
 *    tenders with no Chinese translation yet, this one takes translated
 *    tenders with no generated display text — so the panel reports the two
 *    results under their own headings rather than summing them into a number
 *    that answers neither question.
 *
 * Running second also means this pass reads rows Supabase has already
 * COMMITTED, which is what it needs: it re-reads from the table rather than
 * being handed the first pass's output.
 */

/**
 * The sample path sends every requested row in ONE model call, so a large
 * sample is a single oversized request rather than a longer run. 20 is what
 * the prompt was validated at; anything above it is clamped rather than
 * refused, because the caller wanted a preview and a smaller preview still
 * answers the question.
 */
const MAX_SAMPLE = 20;

/**
 * Model calls run in sequence and can take minutes. Without this the route
 * got the host's default limit and was cut off mid-run (2026-09-28: the panel
 * showed "Unexpected token 'A', \"An error o\"… is not valid JSON" — the host's
 * error page read as JSON). The pass itself stops starting batches at
 * STOP_AFTER_MS and reports what is left, well inside this limit.
 */
export const maxDuration = 300;
const STOP_AFTER_MS = 150_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (!process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json({ error: "DASHSCOPE_API_KEY isn't set. See .env.example." }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; limit?: number; sample?: number };
  const write = body.write === true;

  try {
    const result = await generateDisplayText(supabase, {
      write,
      limit: body.limit,
      sample: write || body.sample === undefined ? undefined : Math.min(body.sample, MAX_SAMPLE),
      stopAfterMs: STOP_AFTER_MS,
    });
    if (result.lastErrorMessage) {
      await logAdminAlert(supabase, "public-titles", new Error(result.lastErrorMessage));
    }
    // These strings are what every list row and every public page renders, and
    // the list is cached — drop it so a write shows up now rather than at the
    // next revalidation.
    if (write) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "public-titles", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
