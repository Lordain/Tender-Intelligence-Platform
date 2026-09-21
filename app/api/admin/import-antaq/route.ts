import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestAntaq } from "@/lib/ingestion/ingest-antaq";
import { isAntaqUnreachable } from "@/lib/ingestion/connectors/antaq-live";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The ANTAQ panel on 新项目清单 → 巴西, over the same ingestAntaq() the CLI
 * runs — one code path, so the page and `npm run ingest:antaq` cannot diverge.
 *
 * ── Why the ceiling is nowhere near the problem it is for PNCP ────────────
 *
 * PNCP's button has to defend a 300-second limit because a 3-day sweep is 795
 * rows and ~400 seconds of amount lookups. ANTAQ is 6 hearing pages plus two
 * index pages, fetched three at a time, and there is no second pass for money
 * because a hearing page states none. A healthy run is seconds. The ceiling is
 * still declared at the platform maximum, because the worst case — gov.br
 * timing out and each page burning its three attempts at 30s — is minutes, and
 * a run killed by the platform writes nothing at all.
 *
 * ── Unreachable is not empty, and the reply has to say which ──────────────
 *
 * This deployment has never fetched ANTAQ. gov.br answered the laptop and the
 * GitHub runner, and leilao.antaq refused all three machines, so the host is
 * known to discriminate by network. If Vercel turns out to be refused, the
 * panel must say 够不着 and hand over the command — not report zero hearings,
 * which is the same words a genuinely empty source would produce.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as {
    years?: number;
    write?: boolean;
    documents?: boolean;
  };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  // A non-integer or negative year count would silently become a window
  // nobody asked for; the CLI refuses those loudly and so does this.
  const years = Number.isInteger(body.years) && Number(body.years) >= 0 ? Number(body.years) : 2;
  const options = {
    write,
    years,
    // Only meaningful on a write run — there is no tender to hang a link on
    // otherwise — so the flag is ANDed rather than trusted from the client.
    documents: write && body.documents === true,
  };

  const cliCommand = `npm run ingest:antaq -- --years ${years}${options.documents ? " --documents" : ""}${write ? " --write" : ""}`;

  try {
    const result = await ingestAntaq(supabase, options);
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    if (isAntaqUnreachable(err)) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : String(err),
          unreachable: true,
          cliCommand,
        },
        { status: 502 },
      );
    }
    await logAdminAlert(supabase, "import-antaq", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), cliCommand }, { status: 500 });
  }
}
