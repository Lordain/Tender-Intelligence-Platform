/**
 * Corrects DOF rows already stored as "awarded" on the strength of a Fallo
 * date — the inference dof-search-mapper.ts stopped making on 2026-09-18.
 *
 * Needed because a mapper change never reaches rows already in the database
 * (same reason fix-colombia-awarded-status.ts and fix-cfe-source-urls.ts
 * exist). lib/tender-status.ts rule 6 hides the WORST of these — the ones
 * whose deadline has not passed yet — but it cannot touch a DOF row whose
 * deadline is also in the past: that one keeps claiming 已中标, an outcome
 * DOF never published, and nothing on the page says otherwise.
 *
 * What it writes: exactly what the fixed mapper would now produce from the
 * same row — "submission_closed" when the bid deadline has passed, "open"
 * otherwise (rule 5 closes a deadline-less row 45 days after publication).
 *
 * What it will not touch:
 *   - rows with a real `awarded_to`. Nothing in DOF fills that column, so a
 *     value there came from the Compras MX contracts export or from an admin
 *     — a real award, with a winner behind it, and this script has no
 *     business overwriting either.
 *   - rows an admin has hand-edited into "awarded"
 *     (manual_field_overrides contains "status"), the same protection
 *     upsert-tenders.ts honours on every import.
 *
 * Usage:
 *   npm run fix:dof-awarded-status               (dry run — report only)
 *   npm run fix:dof-awarded-status -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const PAGE_SIZE = 1000;

type Row = {
  slug: string;
  title: { es?: string; zh?: string } | null;
  status: string;
  submission_deadline: string | null;
  publication_date: string | null;
  awarded_to: string | null;
  manual_field_overrides: string[] | null;
};

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Collected across every page BEFORE any write: writing while paginating
  // this same filtered query would shrink the result set out from under
  // .range() as rows stop matching mid-loop, silently skipping others.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, status, submission_deadline, publication_date, awarded_to, manual_field_overrides")
      .eq("status", "awarded")
      // dof-search-mapper.ts's own slug namespace (`dof-${codNota}`), which is
      // what makes "this row came from a DOF convocatoria" answerable at all.
      .like("slug", "dof-%")
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const now = Date.now();
  const skippedRealAward = rows.filter((row) => row.awarded_to);
  const skippedManual = rows.filter((row) => !row.awarded_to && (row.manual_field_overrides ?? []).includes("status"));
  const toFix = rows
    .filter((row) => !row.awarded_to && !(row.manual_field_overrides ?? []).includes("status"))
    .map((row) => ({
      row,
      status:
        row.submission_deadline && new Date(row.submission_deadline).getTime() < now ? "submission_closed" : "open",
    }));

  console.log(`DOF 项目中状态为「已中标」的：${rows.length} 条`);
  if (skippedRealAward.length > 0) console.log(`  跳过 ${skippedRealAward.length} 条（有真实中标方，来自合同数据或人工录入）`);
  if (skippedManual.length > 0) console.log(`  跳过 ${skippedManual.length} 条（状态是管理员手动改的）`);
  console.log(`  待修正：${toFix.length} 条\n`);

  if (toFix.length === 0) return;

  for (const { row, status } of toFix.slice(0, 30)) {
    const title = (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 46);
    console.log(
      `  ${row.slug.padEnd(16)} 交标 ${row.submission_deadline?.slice(0, 10) ?? "—"}  已中标 -> ${status.padEnd(17)} ${title}`,
    );
  }
  if (toFix.length > 30) console.log(`  …另外 ${toFix.length - 30} 条`);

  if (!shouldWrite) {
    console.log("\n试运行，没有写入。确认无误后加 --write 再跑一次。");
    return;
  }

  let written = 0;
  for (const { row, status } of toFix) {
    const { error } = await supabase.from("tenders").update({ status }).eq("slug", row.slug);
    if (error) {
      console.error(`  写入失败 ${row.slug}: ${error.message}`);
      continue;
    }
    written += 1;
  }
  console.log(`\n已更新 ${written}/${toFix.length} 条。`);
}

main();
