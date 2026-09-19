import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestBrazilPncp } from "@/lib/ingestion/ingest-brazil";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 巴西 tab's button on 新项目清单, over the same ingestBrazilPncp() the
 * CLI runs — one code path, so the page and `npm run ingest:brazil-live`
 * cannot diverge.
 *
 * 300 seconds is the platform ceiling, and a 3-day sweep does not fit inside
 * it. Measured 2026-09-18: a 3-day window is 14 pages and 795 rows, and the
 * amount lookups alone are ~400s at the pace PNCP's rate limiter tolerates
 * (it starts resetting connections above ~2.8 req/s). One day is ~265 rows,
 * ~140s, which does fit. So the form defaults to 1 and the page says plainly
 * that the longer sweeps belong on a terminal — rather than offering a
 * button that dies two thirds of the way through and writes nothing.
 */
export const maxDuration = 300;

/**
 * A failure that is the network refusing us, not PNCP answering badly.
 *
 * Unlike Peru — where SEACE's 403 against datacenter ranges is confirmed —
 * nothing is known about whether this deployment can reach PNCP at all,
 * because it has never run from one. So this matches the shape of a
 * connection-level failure rather than claiming to recognise a specific
 * block, and the reply it produces offers the CLI without asserting why.
 */
function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as {
    days?: number;
    months?: number;
    write?: boolean;
    skipAmounts?: boolean;
    downloadDocuments?: boolean;
  };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const options = {
    write,
    days: Number.isFinite(body.days) ? Number(body.days) : undefined,
    months: Number.isFinite(body.months) ? Number(body.months) : undefined,
    skipAmounts: body.skipAmounts === true,
    // Only meaningful on a write run — there is no tender to hang a link on
    // otherwise — so the flag is ANDed rather than trusted from the client.
    downloadDocuments: write && body.downloadDocuments === true,
  };

  try {
    const result = await ingestBrazilPncp(supabase, options);
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    const flags = [
      options.days ? `--days ${options.days}` : options.months ? `--months ${options.months}` : "--days 1",
      options.skipAmounts ? "--skip-amounts" : "",
    options.downloadDocuments ? "--documents" : "",
      write ? "--write" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (isConnectionFailure(err)) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : String(err),
          connectionFailed: true,
          cliCommand: `npm run ingest:brazil-live -- ${flags}`,
        },
        { status: 502 },
      );
    }
    await logAdminAlert(supabase, "import-brazil", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), cliCommand: `npm run ingest:brazil-live -- ${flags}` }, { status: 500 });
  }
}
