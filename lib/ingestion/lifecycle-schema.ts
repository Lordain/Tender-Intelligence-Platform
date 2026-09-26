import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderStatus } from "@/types/tender";

/**
 * Whether the database has migration 0057 (暂停中 / 流标 and tender_reissues).
 *
 * The code that writes the two new statuses can reach production before
 * someone runs the migration in the SQL editor, and an import batch is 500
 * rows in one statement: a single "suspended" row against the old check
 * constraint would fail all 500. So every writer asks this first and, on an
 * old schema, writes the value each mapper wrote before 0057 instead
 * (legacyStatus). The imports keep working exactly as they did; the new
 * statuses simply start appearing on the first run after the migration.
 *
 * Detected through tender_reissues, which 0057 creates in the same
 * transaction that widens the constraint — PostgREST cannot read
 * pg_constraint, and probing the constraint itself would mean a test write.
 *
 * Cached per process: a cron run or a serverless instance asks once.
 */
const cache = new WeakMap<SupabaseClient, Promise<boolean>>();

export function lifecycleSchemaAvailable(supabase: SupabaseClient): Promise<boolean> {
  let pending = cache.get(supabase);
  if (!pending) {
    pending = (async () => {
      const { error } = await supabase.from("tender_reissues").select("id").limit(1);
      if (!error) return true;
      console.warn(
        `[lifecycle] 数据库还没有运行 0057_tender_lifecycle.sql（${error.message}）——「暂停中」「流标」暂按旧状态写入，重发关联暂不记录。`,
      );
      return false;
    })();
    cache.set(supabase, pending);
  }
  return pending;
}

/** What each mapper wrote for these two before migration 0057. */
export function legacyStatus(status: TenderStatus): TenderStatus {
  if (status === "suspended") return "submission_closed";
  if (status === "deserted") return "cancelled";
  return status;
}
