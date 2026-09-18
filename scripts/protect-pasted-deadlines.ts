/**
 * Repairs — and reports — the damage from the paste tool not locking what it
 * wrote.
 *
 * What happened (2026-09-15). The 粘贴日程表 tool wrote `submission_deadline`
 * with a plain UPDATE and never added the column to `manual_field_overrides`,
 * which is the only thing upsertTendersBatched() reads when deciding what an
 * import may overwrite. A Peru OECE record carries no deadline at all, so the
 * next import wrote null over ~65 hand-entered dates and, because
 * lockedKeyDateTypes() reads the same column list, deleted the mirror row on
 * the timeline too. The route itself is fixed; this handles the rows that
 * were already written before the fix.
 *
 * Two jobs, one pass:
 *
 *   1. LOCK the survivors. A tender that still has its pasted deadline gets
 *      `submission_deadline` (and `award_date`, when a paste filled it) added
 *      to manual_field_overrides, so the next import leaves both alone.
 *   2. LIST the losses. A tender that has pasted cronograma rows but NO
 *      deadline is one the import already emptied. That list is the exact
 *      re-paste worklist — the point is that it is exact, rather than "do all
 *      65 again".
 *
 * Peru only by default, and that is not caution for its own sake: its feed
 * provably publishes no deadline (see seace-cronograma.ts), so any deadline
 * on a Peru tender that has pasted rows came from a human and locking it is
 * right either way. Elsewhere a feed may legitimately supply and update one,
 * and locking that would freeze a real source value — pass --country to
 * inspect another, and read the list before writing.
 *
 * Usage:
 *   npm run protect:pasted-deadlines                 (dry run — reports both lists, writes nothing)
 *   npm run protect:pasted-deadlines -- --write       (adds the locks)
 *   npm run protect:pasted-deadlines -- --country Mexico
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { CRONOGRAMA_SOURCE_REFERENCES } from "../lib/ingestion/seace-cronograma";
import { hasWriteFlag } from "@/lib/cli-write-flag";

type TenderRow = {
  id: string;
  slug: string;
  tender_number: string | null;
  title: { zh?: string; es?: string } | null;
  country: string | null;
  source_url: string | null;
  submission_deadline: string | null;
  award_date: string | null;
  manual_field_overrides: string[] | null;
};

const RULE = "─".repeat(78);
const day = (value: string | null | undefined) => value?.slice(0, 10) ?? "—";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = hasWriteFlag();
  const country = argValue(args, "--country") ?? "Peru";

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Every tender a cronograma was ever pasted into: those rows carry the
  // paste's own source_reference and survive a re-import (manually_added,
  // migration 0033), which is what makes them a reliable marker even after
  // the column they accompanied was emptied.
  const pastedTenderIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tender_key_dates")
      .select("tender_id")
      .in("source_reference", [...CRONOGRAMA_SOURCE_REFERENCES])
      .range(from, from + 999);
    if (error) {
      console.error(`读取关键日期失败：${error.message}`);
      process.exit(1);
    }
    for (const row of data ?? []) pastedTenderIds.add(row.tender_id as string);
    if (!data || data.length < 1000) break;
  }

  console.log(RULE);
  console.log(`共有 ${pastedTenderIds.size} 个项目被粘贴过日程表。`);
  if (pastedTenderIds.size === 0) return;

  const tenders: TenderRow[] = [];
  const ids = [...pastedTenderIds];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, slug, tender_number, title, country, source_url, submission_deadline, award_date, manual_field_overrides")
      .in("id", ids.slice(i, i + 200));
    if (error) {
      console.error(`读取项目失败：${error.message}`);
      process.exit(1);
    }
    tenders.push(...((data ?? []) as TenderRow[]));
  }

  const scoped = tenders.filter((tender) => tender.country === country);
  const others = tenders.length - scoped.length;

  const lost = scoped.filter((tender) => !tender.submission_deadline);
  const survivors = scoped.filter(
    (tender) => tender.submission_deadline && !(tender.manual_field_overrides ?? []).includes("submission_deadline"),
  );
  const alreadyLocked = scoped.length - lost.length - survivors.length;

  console.log(`其中 ${country} ${scoped.length} 个${others > 0 ? `（另有 ${others} 个属于其他国家，本次不处理）` : ""}：`);
  console.log(`  已被导入清空、需要重新粘贴：${lost.length}`);
  console.log(`  日期还在、但没加锁（本次要加锁）：${survivors.length}`);
  console.log(`  日期还在且已加锁：${alreadyLocked}`);

  if (lost.length > 0) {
    console.log(`\n${RULE}\n需要重新粘贴日程表的项目（交标截止日已丢失）：`);
    for (const tender of lost) {
      console.log(`\n  ${tender.slug}`);
      console.log(`    ${tender.tender_number ?? "—"}　${tender.title?.zh ?? tender.title?.es ?? ""}`);
      console.log(`    ${tender.source_url ?? "（没有来源链接）"}`);
    }
  }

  if (survivors.length > 0) {
    console.log(`\n${RULE}\n本次要加锁的项目：`);
    for (const tender of survivors) {
      console.log(`  ${tender.slug}　交标 ${day(tender.submission_deadline)}${tender.award_date ? `　中标 ${day(tender.award_date)}` : ""}`);
    }
  }

  if (!shouldWrite) {
    console.log(`\n空跑（加 --write 才会写库）——什么都没改。`);
    return;
  }

  let locked = 0;
  for (const tender of survivors) {
    const overrides = new Set<string>(tender.manual_field_overrides ?? []);
    overrides.add("submission_deadline");
    // Only when a date is actually there: locking an empty column would stop
    // a future import from ever filling it.
    if (tender.award_date) overrides.add("award_date");

    const { error } = await supabase
      .from("tenders")
      .update({ manual_field_overrides: [...overrides].sort() })
      .eq("id", tender.id);
    if (error) {
      console.error(`  ${tender.slug} 加锁失败：${error.message}`);
      continue;
    }
    locked += 1;
  }
  console.log(`\n已给 ${locked} 个项目加锁，之后的导入不会再覆盖它们的交标/中标日期。`);
}

main();
