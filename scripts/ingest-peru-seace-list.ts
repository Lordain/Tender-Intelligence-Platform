/**
 * CLI for the 秘鲁 tab's 「SEACE — 上传导出清单」: a Lista-Procesos.xls
 * exported from SEACE's own search page. Same function as the upload
 * (lib/ingestion/ingest-peru-seace-list.ts).
 *
 * Usage:
 *   npm run ingest:peru-seace-list -- path/to/Lista-Procesos.xls            (dry run + classification report)
 *   npm run ingest:peru-seace-list -- path/to/Lista-Procesos.xls --write
 */
import { readFileSync } from "node:fs";
import { importPeruSeaceList } from "../lib/ingestion/ingest-peru-seace-list";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

async function main() {
  const path = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!path) {
    console.error("用法：npm run ingest:peru-seace-list -- <Lista-Procesos.xls> [--write]");
    process.exit(1);
  }
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await importPeruSeaceList(supabase, readFileSync(path), { write, preview: !write });
  console.log(`文件共 ${result.totalRows} 条；从评标阶段重启 ${result.lateRestartCount} 条（跳过）。`);
  if (supabase) console.log(`库里已有 ${result.alreadyInDatabaseCount} 条、之前删除过 ${result.previouslyDeletedCount} 条（都跳过）。`);
  else console.log("（没有数据库连接，未检查库里是否已有。）");
  const { flagship, significant, standard, excluded } = result.tierCounts;
  console.log(`新项目 ${result.keptCount} 条：大型 ${flagship}、中型 ${significant}、普通 ${standard}、不推荐 ${excluded}。`);

  if (!write) {
    reportClassificationPreview(result.preview ?? [], { examples: 40, label: "ingest-peru-seace-list", exportBaseName: "peru-seace-list-preview" });
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }
  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${result.upsertedCount ?? 0} tender(s); skipped ${result.skippedExcludedCount ?? 0} excluded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
