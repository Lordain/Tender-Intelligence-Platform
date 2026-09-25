import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { logAdminAlert } from "@/lib/admin-alerts";
import { ingestPetronect } from "@/lib/ingestion/ingest-petronect";
import { ingestCemig } from "@/lib/ingestion/ingest-cemig";
import { ingestUpme } from "@/lib/ingestion/ingest-upme";
import { ingestPetroperu } from "@/lib/ingestion/ingest-petroperu";
import type { Tender } from "@/types/tender";
import { COMPANY_IMPORT_SOURCES, type CompanyImportResult, type CompanyImportSample, type CompanyImportSource } from "@/lib/admin/company-import";

/**
 * The manual buttons for the company sources added on 2026-09-25, one per
 * country tab of 新项目清单 (user: 针对新接口，麻烦都在后台对应国家增加手动
 * 接口，都是只考虑1-3天的数据):
 *
 *   巴西    Petronect (Petrobras/Transpetro), Cemig
 *   哥伦比亚 UPME transmission calls
 *   秘鲁    Petroperú international competitions (PCI)
 *
 * Each runs the same ingest function as its daily job, so the page and the
 * cron cannot diverge; only the window differs — 1, 2 or 3 days, nothing
 * else accepted. Codelco has its button on the 智利 tab already.
 */
export const maxDuration = 300;

const SOURCES = COMPANY_IMPORT_SOURCES;
type Source = CompanyImportSource;
const WINDOW_DAYS = [1, 2, 3] as const;

function sample(tenders: Tender[]): CompanyImportSample[] {
  return tenders.map((tender) => ({
    slug: tender.slug,
    tenderNumber: tender.tenderNumber,
    title: tender.title.es,
    tier: tender.relevance.tier,
    ...(tender.submissionDeadline ? { submissionDeadline: tender.submissionDeadline } : {}),
  }));
}

function notWritten(counts: { closed?: number; shortWindow?: number }): string[] {
  return [
    counts.closed ? `已过截止日 ${counts.closed} 条` : undefined,
    counts.shortWindow ? `交标期不足 12 天 ${counts.shortWindow} 条` : undefined,
  ].filter((line): line is string => Boolean(line));
}

async function run(source: Source, write: boolean, days: number, supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<CompanyImportResult> {
  if (source === "petronect") {
    const r = await ingestPetronect(supabase, { write, days });
    return {
      source,
      days,
      summary: `Petronect 在招 ${r.fetchedCount} 个 → 近 ${days} 天发布 ${r.recentCount} 个 → 进入推荐 ${r.kept.length} 个`,
      staleWarning: r.staleWarning,
      kept: sample(r.kept),
      write,
      upsertedCount: r.upsertedCount,
      notWritten: notWritten({ closed: r.skippedClosedCount, shortWindow: r.skippedShortWindowCount }),
      failed: r.failed,
    };
  }
  if (source === "cemig") {
    const r = await ingestCemig(supabase, { write, days });
    return {
      source,
      days,
      summary: `Cemig 已发布 ${r.fetchedCount} 个流程 → 近 ${days} 天发布 ${r.recentCount} 个 → 进入推荐 ${r.kept.length} 个`,
      staleWarning: r.staleWarning,
      kept: sample(r.kept),
      write,
      upsertedCount: r.upsertedCount,
      notWritten: notWritten({ closed: r.skippedClosedCount, shortWindow: r.skippedShortWindowCount }),
      failed: r.failed,
    };
  }
  if (source === "upme") {
    const r = await ingestUpme(supabase, { write, days });
    return {
      source,
      days,
      summary: `UPME 标为开放/预公告 ${r.taggedCount} 个 → 仍可投标 ${r.biddableCount} 个 → 近 ${days} 天发布 ${r.kept.length} 个`,
      staleWarning: r.staleWarning,
      kept: sample(r.kept),
      write,
      upsertedCount: r.upsertedCount,
      failed: r.failed,
    };
  }
  const r = await ingestPetroperu(supabase, { write, days });
  return {
    source,
    days,
    summary: `Petroperú 列表 ${r.listedCount} 行，正式招标（PCI）${r.pciCount} 个 → 近 ${days} 天发布 ${r.calls.length} 个 → 导入 ${r.kept.length} 个`,
    staleWarning: r.staleWarning,
    kept: sample(r.kept),
    write,
    upsertedCount: r.upsertedCount,
    notWritten: r.calls.filter((c) => c.skipReason).map((c) => `${c.call.code}：${c.skipReason}`),
    failed: r.failed,
  };
}

/** Same test as the Chile route: the network refusing us, not the source answering badly. */
function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { source?: string; write?: boolean; days?: number };
  if (!SOURCES.includes(body.source as Source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });
  const source = body.source as Source;
  const write = body.write === true;
  const days = (WINDOW_DAYS as readonly number[]).includes(body.days ?? -1) ? body.days! : 3;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const cliCommand = `npm run cron:${source} -- --days ${days}${write ? " --write" : ""}`;
  try {
    const result = await run(source, write, days, supabase);
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, `import-company-${source}`, err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
