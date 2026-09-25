import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestChile } from "@/lib/ingestion/ingest-chile";
import { ingestCodelco } from "@/lib/ingestion/ingest-codelco";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 智利 tab's buttons on 新项目清单 (user, 2026-09-25: 智利后台没有手动加
 * 项目的选项？请加一下), over the same ingestChile() / ingestCodelco() the
 * daily job runs — one code path, so the page and `cron:chile` cannot diverge.
 *
 * Mercado Público is the one that needs care with time. The search export is
 * ~15 requests; the closing date then comes from each kept row's own ficha at
 * 2.5 s a request (see chile-ficha-live.ts), ~3 minutes for the ~70 rows kept
 * on 2026-09-25. So:
 *
 *  - A preview reads no ficha at all. The tier does not depend on the
 *    closing date, so a preview's counts are the same without it, in seconds.
 *  - A write reads fichas until FICHA_BUDGET_MS after the request started and
 *    then stops. Rows it did not reach are written without a closing date and
 *    the next daily run fills them in; an import never erases a stored one.
 */
export const maxDuration = 300;

const FICHA_BUDGET_MS = 200_000;
const ENRICH_LIMIT = 300;
/**
 * The manual run takes only the last 1–3 days (user, 2026-09-25: 手动只要1-3天，
 * 不要两个月). The daily job keeps its own window; this page is for catching
 * what was published since, not for re-reading two months of backlog.
 */
const MANUAL_WINDOW_DAYS = [1, 2, 3] as const;
const DEFAULT_MANUAL_WINDOW_DAYS = 3;

/** Same test as the Brazil route: the network refusing us, not the source answering badly. */
function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

export async function POST(request: Request) {
  const started = Date.now();
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { source?: "mercadopublico" | "codelco"; write?: boolean; days?: number };
  const source = body.source === "codelco" ? "codelco" : "mercadopublico";
  const write = body.write === true;
  const days = (MANUAL_WINDOW_DAYS as readonly number[]).includes(body.days ?? -1) ? body.days! : DEFAULT_MANUAL_WINDOW_DAYS;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const cliCommand = source === "codelco"
    ? `npm run cron:codelco -- --days ${days}${write ? " --write" : ""}`
    : `npm run cron:chile -- --days ${days}${write ? " --write" : ""}`;

  try {
    if (source === "codelco") {
      const result = await ingestCodelco(supabase, { write, days });
      if (write) revalidateTenders();
      return NextResponse.json({ source, ...result });
    }

    const result = await ingestChile(supabase, {
      write,
      door: "busca",
      days,
      enrichLimit: write ? ENRICH_LIMIT : 0,
      enrichUntil: started + FICHA_BUDGET_MS,
      preview: false,
    });
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    return NextResponse.json({ source, days, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) {
      return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    }
    await logAdminAlert(supabase, `import-chile-${source}`, err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
