import { NextRequest, NextResponse } from "next/server";
import { revalidateTenders } from "@/lib/cache-tags";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Drops the public tender list's cache so the next visitor sees the day's
 * imports (2026-10-30). The list is cached for 24 hours (lib/tenders.ts) to
 * keep Supabase egress inside the Free plan, so new rows written by the daily
 * import on GitHub Actions — which has no Next.js request context to call
 * revalidateTag from — would otherwise wait out the day.
 *
 * Called by the workflow's last job once the imports have finished
 * (.github/workflows/daily-ingest.yml), and by Vercel a couple of hours after
 * each daily pass (vercel.json) in case that job did not run. Reads nothing
 * itself: the one rebuild happens on the next request.
 */
async function handle(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  revalidateTenders();
  return NextResponse.json({ revalidated: true });
}

export const GET = handle;
export const POST = handle;
