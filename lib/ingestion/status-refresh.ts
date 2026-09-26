import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderStatus } from "@/types/tender";
import { deriveTenderStatus } from "@/lib/tender-status";
import { legacyStatus, lifecycleSchemaAvailable } from "@/lib/ingestion/lifecycle-schema";

/**
 * Status-only refresh of tenders ALREADY stored, from what their source says
 * about them today (user, 2026-09-26: 自动&手动，刷新标书状态).
 *
 * Why it exists: nearly every import keeps only rows PUBLISHED in a recent
 * window (three days for most sources), so a tender imported last month is
 * never read again, and a pause, a resumption, a cancellation or a 流标 that
 * happens to it afterwards never reaches the platform. A source that can
 * still say something about older rows — an all-states export, an open-list
 * that carries a state column — hands this function what it observed, and
 * only the status column moves.
 *
 * Only status. The other columns stay exactly as the full import wrote them:
 * an observation from an all-states listing usually lacks the bid schedule,
 * and upserting it as a whole tender would clear dates (see
 * readPeruOxiWorkbook on why OxI's all-states export is used this way).
 *
 * What it refuses to do, and reports instead:
 *   - touch a status an admin set by hand (manual_field_overrides has
 *     "status") — the same lock every import honours;
 *   - reopen a finished tender. awarded / cancelled / deserted → open is far
 *     more often a source's own lag than a real revival, and a real
 *     re-issue arrives as a new procedure (see reissue.ts). Moving a
 *     finished tender to suspended is allowed: ProInversión really does
 *     suspend after the buena pro;
 *   - write a change nobody would see. Stored "open" on a row whose deadline
 *     has passed already READS 已截止 (lib/tender-status.ts); writing
 *     "submission_closed" over it changes nothing on the page but would log a
 *     status change and put it in subscribers' digest emails. So the change
 *     is judged on the derived status, before and after.
 *
 * Before migration 0057 the two new statuses cannot be stored: "deserted" is
 * written as the old "cancelled", and "suspended" is not written at all — a
 * paused tender shown as 已截止 for a day and then as 暂停中 would email
 * subscribers twice about one pause.
 */
export type ObservedStatus = { slug: string; status: TenderStatus };

export type StatusChange = { slug: string; title: string; from: TenderStatus; to: TenderStatus };

export type StatusRefreshResult = {
  observedCount: number;
  /** Observed slugs that are stored here at all. */
  matchedCount: number;
  changes: StatusChange[];
  /** An admin set the status by hand; left alone. */
  protectedSlugs: string[];
  /** The source says open again about a finished tender; left alone. */
  reopenRefused: StatusChange[];
  /** Would-be changes skipped because migration 0057 has not been run. */
  awaitingMigration: number;
  write: boolean;
  failed?: string;
};

const FINISHED: TenderStatus[] = ["awarded", "cancelled", "deserted"];
const REOPENING: TenderStatus[] = ["open", "clarification", "planned"];
const LOOKUP_CHUNK = 100;

type StoredRow = {
  id: string;
  slug: string;
  status: TenderStatus;
  title: { zh?: string; es?: string } | null;
  submission_deadline: string | null;
  publication_date: string | null;
  source_name: string | null;
  manual_field_overrides: string[] | null;
};

export async function refreshStoredStatuses(
  supabase: SupabaseClient,
  observed: ObservedStatus[],
  options: { write: boolean; now?: Date },
): Promise<StatusRefreshResult> {
  const result: StatusRefreshResult = {
    observedCount: observed.length,
    matchedCount: 0,
    changes: [],
    protectedSlugs: [],
    reopenRefused: [],
    awaitingMigration: 0,
    write: options.write,
  };
  if (observed.length === 0) return result;

  const lifecycleReady = await lifecycleSchemaAvailable(supabase);
  const now = options.now ?? new Date();

  // One observation per slug; the last one wins, as it would on a re-read.
  const bySlug = new Map(observed.map((entry) => [entry.slug, entry.status]));
  const slugs = [...bySlug.keys()];

  const stored: StoredRow[] = [];
  for (let i = 0; i < slugs.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, slug, status, title, submission_deadline, publication_date, source_name, manual_field_overrides")
      .in("slug", slugs.slice(i, i + LOOKUP_CHUNK));
    if (error) return { ...result, failed: `读取已入库项目失败：${error.message}` };
    stored.push(...((data ?? []) as StoredRow[]));
  }
  result.matchedCount = stored.length;

  const idsByTarget = new Map<TenderStatus, string[]>();
  for (const row of stored) {
    let next = bySlug.get(row.slug)!;
    if (!lifecycleReady) {
      if (next === "suspended") {
        if (row.status !== "suspended") result.awaitingMigration += 1;
        continue;
      }
      next = legacyStatus(next);
    }
    if (next === row.status) continue;

    const title = row.title?.zh || row.title?.es || row.slug;
    const change: StatusChange = { slug: row.slug, title, from: row.status, to: next };

    if ((row.manual_field_overrides ?? []).includes("status")) {
      result.protectedSlugs.push(row.slug);
      continue;
    }
    if (FINISHED.includes(row.status) && REOPENING.includes(next)) {
      result.reopenRefused.push(change);
      continue;
    }

    const fields = { submissionDeadline: row.submission_deadline, publicationDate: row.publication_date, sourceName: row.source_name };
    if (deriveTenderStatus(row.status, fields, now) === deriveTenderStatus(next, fields, now)) continue;

    result.changes.push(change);
    const ids = idsByTarget.get(next);
    if (ids) ids.push(row.id);
    else idsByTarget.set(next, [row.id]);
  }

  if (!options.write || result.changes.length === 0) return result;

  // One statement per target status. The status trigger (migration 0018)
  // records each change in tender_status_history, which is what the digest
  // emails subscribers from — a pause and a resumption reach them the same
  // way any other status change does.
  const updatedAt = now.toISOString();
  for (const [status, ids] of idsByTarget) {
    for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
      const { error } = await supabase.from("tenders").update({ status, updated_at: updatedAt }).in("id", ids.slice(i, i + LOOKUP_CHUNK));
      if (error) return { ...result, failed: `写入状态失败（${status}）：${error.message}` };
    }
  }
  return result;
}

/** One line per change, for a cron log or an admin panel. */
export function describeStatusRefresh(result: StatusRefreshResult, labels: Record<TenderStatus, string>): string[] {
  const lines = [
    `对照来源 ${result.observedCount} 条，其中已入库 ${result.matchedCount} 条；状态变化 ${result.changes.length} 条${result.write ? "（已写入）" : "（试运行，未写入）"}。`,
  ];
  for (const change of result.changes.slice(0, 30)) lines.push(`  ${labels[change.from]} → ${labels[change.to]}  ${change.slug}  ${change.title.slice(0, 60)}`);
  if (result.changes.length > 30) lines.push(`  …以及另外 ${result.changes.length - 30} 条`);
  if (result.protectedSlugs.length > 0) lines.push(`  人工改过状态、未动：${result.protectedSlugs.slice(0, 10).join("，")}`);
  for (const change of result.reopenRefused.slice(0, 10)) {
    lines.push(`  来源称已重新开放，但本站已是「${labels[change.from]}」，未自动改回：${change.slug}（如确实恢复，请在后台手动修改）`);
  }
  if (result.awaitingMigration > 0) lines.push(`  ${result.awaitingMigration} 条应改为「暂停中」，需先在 Supabase 运行 0057_tender_lifecycle.sql。`);
  if (result.failed) lines.push(`  ⚠ ${result.failed}`);
  return lines;
}
