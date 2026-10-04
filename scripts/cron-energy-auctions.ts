/**
 * Writes the hand-kept national energy auctions (lib/ingestion/energy-auctions.ts)
 * — open and awarded — so an edited record reaches the site the next morning.
 * Invoked by .github/workflows/daily-ingest.yml. Added 2026-10-04 (user:
 * 「能源拍卖」数据源，包括历史拍卖 ← OK，会写入现网 ← OK).
 *
 * Usage:
 *   npm run cron:energy-auctions              (dry run — prints the records, writes nothing)
 *   npm run cron:energy-auctions -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ENERGY_AUCTIONS, energyAuctionToTender } from "../lib/ingestion/energy-auctions";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const STATUS_LABEL: Record<string, string> = { open: "招标中", awarded: "已中标", submission_closed: "已截标" };

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const now = new Date();
  const tenders = ENERGY_AUCTIONS.map((auction) => energyAuctionToTender(auction, now));
  console.log(`能源拍卖 ${tenders.length} 条：`);
  for (const tender of tenders) console.log(`  [${STATUS_LABEL[tender.status] ?? tender.status}] ${tender.country} · ${tender.title.zh}`);

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const { upsertedCount, failed } = await upsertTendersBatched(supabase!, tenders);
  const problem = failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(supabase!, "import-energy-auctions", problem ? "failed" : "ok", problem ?? `能源拍卖 ${tenders.length} 条，写入 ${upsertedCount} 条`);
  for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${upsertedCount} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
