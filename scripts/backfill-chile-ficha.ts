/**
 * Reads each stored Chilean tender's OWN ficha and fills in what the search
 * CSV could not carry: the closing date, and the bid documents.
 *
 * DRY RUN BY DEFAULT. `--write` has to come after `--` or npm eats it.
 *
 * ── Why this is not `ingest:chile-live --enrich` ─────────────────────────
 *
 * That path re-reads the SEARCH pages, ten cards per request, in the site's
 * own order, and keeps the first N. The rows we store are a relevance-filtered
 * subset of a 1,309-row shortlist, so asking it for 60 cards fills sixty rows
 * that are mostly not ours. This one starts from the tenders in the database
 * and asks the site about each by code.
 *
 * ── What it writes ───────────────────────────────────────────────────────
 *
 *   tenders.submission_deadline   the ficha's Fecha de Cierre
 *   tender_key_dates (submission) kept in step via syncKeyDatesForTopLevelFields,
 *                                 so the overview card and the 关键日期 timeline
 *                                 cannot disagree — the gap found 2026-09-05
 *   tender_documents              one row per attachment, ONLY with --download,
 *                                 because a row there means "we hold this file"
 *
 * What it can NOT reach: the tender's own 「Ver anexos」 (ViewAttachment.aspx),
 * where the Bases and the Acta PDFs live. That page is behind reCAPTCHA
 * Enterprise (checked 2026-09-25 on 1388961-49-LR26) and is not bypassed
 * here. The VerAntecedentes indexes this script does read are the product
 * lines' forms — .docx/.xlsx, not the bid documents — so a tender can come
 * out of a --download run with eleven files and no Bases. It therefore stays
 * on /admin/documents-needed (badged 缺 PDF) until something is analysed.
 *
 * Nothing is written to `tender_document_links`: a Chilean attachment has no
 * URL of its own (it is an ASP.NET postback), and storing the index page there
 * would put HTML behind a download button — see chile-ficha-live.ts.
 *
 * A column an admin has hand-edited (manual_field_overrides, migration 0032)
 * is left alone, the same rule every ingestion path here follows.
 *
 * Usage:
 *   npm run backfill:chile-ficha                          最近 3 个自然日，试运行
 *   npm run backfill:chile-ficha -- --days 5
 *   npm run backfill:chile-ficha -- --write
 *   npm run backfill:chile-ficha -- --write --download    连标书一起下到 downloads/chile/<slug>/
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";
import { safeFileName } from "@/lib/ingestion/document-links";
import { downloadChileAttachment, fetchChileFicha } from "@/lib/ingestion/connectors/chile-ficha-live";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

type Row = {
  id: string;
  slug: string;
  tender_number: string;
  publication_date: string | null;
  submission_deadline: string | null;
  manual_field_overrides: string[] | null;
};

async function main() {
  const write = hasWriteFlag(process.argv);
  const download = process.argv.includes("--download");
  const days = Number(argValue("--days") ?? 3);
  const outRoot = argValue("--out") ?? join("downloads", "chile");

  if (!Number.isFinite(days) || days < 1) {
    console.error(`--days 要是 1 以上的整数，收到 "${argValue("--days")}"`);
    process.exit(1);
  }
  if (download && !write) {
    // Downloading without writing would pull real files and then record
    // nothing, so the next run downloads them all over again.
    console.error("--download 需要配合 --write：只下不记，下一次还会再下一遍。");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase 没配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。见 .env.example。什么都没做。");
    process.exit(1);
  }

  // CALENDAR days, not the rolling `now - days*24h` that recency.ts applies to
  // a feed. `tenders.publication_date` is a date column with no time in it, so
  // a 72-hour cutoff cannot be expressed against it — it would either include
  // all of the third day back or none of it, depending on the hour the script
  // happened to run, which is how the same command returns 59 rows in the
  // evening and 41 in the morning. `--days 3` here means today and the two
  // days before it, and the range is printed so it is never in doubt.
  const today = new Date();
  const since = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("tenders")
    .select("id, slug, tender_number, publication_date, submission_deadline, manual_field_overrides")
    .eq("country", "Chile")
    .gte("publication_date", since)
    .order("publication_date", { ascending: false });
  if (error) {
    console.error(`读取智利项目失败：${error.message}`);
    process.exit(1);
  }
  const rows = (data ?? []) as Row[];

  console.log(`\n智利 ficha 补录　${write ? "写入模式" : "试运行（加 --write 才真写）"}`);
  console.log(`窗口：发布日 ${since} ～ ${until}（最近 ${days} 个自然日）　命中 ${rows.length} 条\n`);
  if (rows.length === 0) {
    console.log("这个窗口里没有智利项目，什么都没做。");
    return;
  }

  let deadlinesFilled = 0;
  let deadlinesChanged = 0;
  let deadlinesUnchanged = 0;
  let deadlinesPinned = 0;
  let deadlinesMissing = 0;
  let withAttachments = 0;
  let filesSeen = 0;
  let filesDownloaded = 0;
  let filesAlreadyOnFile = 0;
  const failures: string[] = [];
  const refusals: string[] = [];
  const pastDeadlines: string[] = [];

  for (const [index, row] of rows.entries()) {
    const label = `[${index + 1}/${rows.length}] ${row.tender_number}`;
    let ficha;
    try {
      ficha = await fetchChileFicha(row.tender_number);
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      failures.push(`${row.tender_number}：${message}`);
      console.log(`${label}　✗ ${message}`);
      continue;
    }
    refusals.push(...ficha.refusals);

    const pinned = (row.manual_field_overrides ?? []).includes("submission_deadline");
    const found = ficha.closing?.date;
    let deadlineNote = "";
    if (!found) {
      deadlinesMissing += 1;
      deadlineNote = "ficha 上没有交标截止日";
    } else if (pinned) {
      deadlinesPinned += 1;
      deadlineNote = `截止 ${found}（管理员锁定了这个字段，不动）`;
    } else if (row.submission_deadline === found) {
      deadlinesUnchanged += 1;
      deadlineNote = `截止 ${found}（库里已是这个值）`;
    } else {
      if (row.submission_deadline) {
        deadlinesChanged += 1;
        deadlineNote = `截止 ${row.submission_deadline} → ${found}（对方改了日期）`;
      } else {
        deadlinesFilled += 1;
        deadlineNote = `截止 ${found}　新补`;
      }
      // A deadline already in the past is worth naming rather than writing
      // silently: status is derived from it at read time (lib/tender-status.ts),
      // so this row will flip to 已截止 the moment it is saved.
      if (found < new Date().toISOString().slice(0, 10)) pastDeadlines.push(`${row.tender_number} → ${found}`);
      if (write) {
        const { error: updateError } = await supabase
          .from("tenders")
          .update({ submission_deadline: found })
          .eq("id", row.id);
        if (updateError) {
          failures.push(`${row.tender_number}：写交标截止日失败 ${updateError.message}`);
          deadlineNote += "　✗ 写入失败";
        } else {
          await syncKeyDatesForTopLevelFields(supabase, row.id, { submissionDeadline: found });
        }
      }
    }

    filesSeen += ficha.attachments.length;
    if (ficha.attachments.length > 0) withAttachments += 1;
    console.log(`${label}　${deadlineNote}　附件 ${ficha.attachments.length} 个`);

    if (!download || ficha.attachments.length === 0) continue;

    const { data: already } = await supabase.from("tender_documents").select("file_name").eq("tender_id", row.id);
    const onFile = new Set((already ?? []).map((d: { file_name: string }) => d.file_name));

    for (const attachment of ficha.attachments) {
      const fileName = safeFileName(attachment.fileName);
      if (onFile.has(fileName)) {
        filesAlreadyOnFile += 1;
        continue;
      }
      try {
        const file = await downloadChileAttachment(attachment);
        const dir = join(outRoot, row.slug);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, fileName), file.bytes);

        const { error: insertError } = await supabase.from("tender_documents").insert({
          tender_id: row.id,
          file_name: fileName,
          document_type: "unknown",
          // The index page, named for what it is: the human-openable place
          // this file came from. It is NOT a download URL — see the module header.
          source_url: attachment.indexUrl,
          content_hash: createHash("sha256").update(file.bytes).digest("hex"),
          // Only PDFs go down the extraction path; a .docx/.xlsx is held but
          // not parsed, the same rule ingest-colombia.ts applies.
          extraction_status: fileName.toLowerCase().endsWith(".pdf") ? "pending" : "not_extractable",
        });
        if (insertError) {
          failures.push(`${row.tender_number} / ${fileName}：入库失败 ${insertError.message}`);
          continue;
        }
        filesDownloaded += 1;
        console.log(`        ↓ ${fileName}　${(file.bytes.length / 1024).toFixed(0)} KB`);
      } catch (err) {
        failures.push(`${row.tender_number} / ${fileName}：${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
  }

  console.log(`
────────────────────────────────────────────────────────
  项目          ${rows.length} 条（发布日 ${since} ～ ${until}）
  交标截止日    新补 ${deadlinesFilled}　对方改期 ${deadlinesChanged}　本就一致 ${deadlinesUnchanged}　管理员锁定 ${deadlinesPinned}　ficha 上就没有 ${deadlinesMissing}
  附件          ${withAttachments} 条项目有附件，共 ${filesSeen} 个文件${download ? `　已下 ${filesDownloaded}　库里已有 ${filesAlreadyOnFile}` : "（没加 --download，只数不下）"}
  抓取失败      ${failures.length}
────────────────────────────────────────────────────────`);

  if (pastDeadlines.length > 0) {
    console.log(`\n⚠ 截止日已经过去的 ${pastDeadlines.length} 条（存进去后状态会变成「已截止」）：\n${pastDeadlines.map((p) => `  - ${p}`).join("\n")}`);
  }
  if (refusals.length > 0) {
    console.log(`\n⚠ 有 ${refusals.length} 个附件页读不出来（这是关于我们的请求，不是关于项目）：\n${refusals.slice(0, 5).map((r) => `  - ${r.split("\n")[0]}`).join("\n")}`);
  }
  if (failures.length > 0) {
    console.log(`\n✗ 失败 ${failures.length} 条：\n${failures.slice(0, 15).map((f) => `  - ${f}`).join("\n")}`);
  }
  if (!write) console.log("\n试运行结束 —— 一个字都没写进 Supabase。加 --write 才真写。\n");
  else console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
