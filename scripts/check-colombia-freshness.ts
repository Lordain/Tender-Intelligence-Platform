/**
 * Answers one question, with numbers instead of a feeling: is our Colombia
 * feed showing the newest tenders SECOP II has, and if not, where are they
 * being lost?
 *
 * Written because the honest answer to "哥伦比亚的项目时间差是多久" (user,
 * 2026-09-11, again 2026-09-12) was that nobody had measured it — there is no
 * figure anywhere in this repo — and because "we look out of date" has four
 * completely different causes that all look identical from the tender list:
 *
 *   1. datos.gov.co itself is behind (an entity published, SECOP II has not
 *      synced it yet). Nothing we can do; worth knowing.
 *   2. It is there, but our modalidad gate rejects it
 *      (isIngestedColombiaModalidad — only Licitación pública enters).
 *   3. It passes the gate but classifyRelevance excludes it, so it is never
 *      written. This is the one that has twice turned out to be a missing
 *      keyword rather than a real judgement.
 *   4. It is in Supabase and simply was not imported recently — the Colombia
 *      import is manual, so this is just "nobody pressed the button".
 *
 * The report separates all four by counting the SAME days at each stage, so a
 * column that drops to zero names the stage that lost them.
 *
 * Read-only: fetches the source and reads Supabase, writes nothing.
 *
 * Usage:
 *   npm run check:colombia            (last 14 days)
 *   npm run check:colombia -- --days 30
 */
import { fetchSecopProcesos } from "../lib/ingestion/connectors/colombia-secop-live";
import { mapSecopRowToTender, isIngestedColombiaModalidad } from "../lib/ingestion/colombia-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { REVIEW_CSV_HEADERS, reviewCsvRow, toCsv, writeReviewCsv } from "../lib/ingestion/review-csv";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

function dayOf(value: string | undefined | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function bump(map: Map<string, number>, day: string | null) {
  if (day) map.set(day, (map.get(day) ?? 0) + 1);
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--days");
  const days = Math.max(1, Number(idx >= 0 ? args[idx + 1] : 14) || 14);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Asking datos.gov.co for everything published since ${since.toISOString().slice(0, 10)}...\n`);

  // NOTE: the connector already applies a coarse server-side modalidad filter
  // (`like '%icitaci%'`), so "fetched" below is not all of SECOP II — it is
  // everything that could possibly pass our gate. That is the right
  // denominator here: a Contratación Directa we never wanted is not a
  // freshness problem.
  const rows = await fetchSecopProcesos({ sinceDate: since });

  const fetched = new Map<string, number>();
  const passedModalidad = new Map<string, number>();
  const wouldBeWritten = new Map<string, number>();
  const excluded: Tender[] = [];
  const keptBySlug = new Map<string, Tender>();
  /** Source rows that were a later phase of a procurement already counted — see the comment at the bump below. */
  let phaseDuplicateRows = 0;

  for (const row of rows) {
    const day = dayOf(row.fecha_de_publicacion_del);
    bump(fetched, day);
    if (!isIngestedColombiaModalidad(row.modalidad_de_contratacion)) continue;
    bump(passedModalidad, day);
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (!tender) continue;
    if (tender.relevance.tier !== "excluded") {
      // Counted ONCE per slug, not once per row. SECOP II publishes the same
      // procurement several times as it moves through its phases — the
      // reference picks up a suffix ("JBB-LP-004-2026 (Presentación de
      // oferta)") that colombia-mapper.ts strips, so several source rows,
      // often on DIFFERENT days, collapse to one tender.
      //
      // Counting rows here made this column structurally incomparable with
      // 「已在库里」, which counts stored rows and therefore counts each
      // procurement once. A real run (2026-09-15, 7-day window) printed 27
      // against 0 for a single day and read as "27 tenders went missing";
      // the real figure was 35 rows collapsing to 13 procurements, 8 of them
      // already stored under the earlier publication date one of their own
      // phase rows carried. Nothing was missing. Two columns that cannot be
      // subtracted from each other must not be printed side by side.
      if (!keptBySlug.has(tender.slug)) bump(wouldBeWritten, day);
      else phaseDuplicateRows += 1;
      keptBySlug.set(tender.slug, tender);
    } else {
      excluded.push(tender);
    }
  }

  const inSupabase = new Map<string, number>();
  const storedSlugs = new Set<string>();
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, publication_date")
      .eq("source_name", SOURCE_NAME)
      .gte("publication_date", since.toISOString().slice(0, 10))
      .limit(5000);
    if (error) console.error(`Could not read Supabase: ${error.message}`);
    for (const row of (data ?? []) as { slug: string; publication_date: string }[]) {
      bump(inSupabase, dayOf(row.publication_date));
      storedSlugs.add(row.slug);
    }
  } else {
    // Loudly, and repeated in the conclusion below: the first real run was
    // read as "we have nothing since August" when the truth was that the CLI
    // simply had no credentials (the npm script was missing
    // --env-file-if-exists=.env.local, which every other script here has).
    // A zero that means "not measured" must never look like a zero that means
    // "not there".
    console.error("!! Supabase isn't configured for this shell — 「已在库里」全列无意义，不是 0，是没测。\n");
  }
  const dbMeasured = Boolean(supabase);

  const allDays = [...new Set([...fetched.keys(), ...inSupabase.keys()])].sort().reverse();

  // "源头（招标类）" rather than "源头有": the connector already applies a
  // server-side `like '%icitaci%'` filter, so this column was never all of
  // SECOP II. The first real run made that obvious — the first two columns
  // were byte-identical on every single day (62/62, 35/35, 27/27), which is
  // not a finding, it is the same number printed twice under two names.
  console.log("发布日        源头（招标类）   通过采购方式闸门   规则判定值得写   已在库里");
  console.log("────────────────────────────────────────────────────────────────────────────");
  for (const day of allDays) {
    const cells = [
      String(fetched.get(day) ?? 0).padStart(10),
      String(passedModalidad.get(day) ?? 0).padStart(16),
      String(wouldBeWritten.get(day) ?? 0).padStart(15),
      String(inSupabase.get(day) ?? 0).padStart(11),
    ];
    console.log(`${day}  ${cells.join("")}`);
  }

  const totalPassed = [...passedModalidad.values()].reduce((a, b) => a + b, 0);
  const totalKept = [...wouldBeWritten.values()].reduce((a, b) => a + b, 0);
  console.log(
    `${"合计".padEnd(12)}${String([...fetched.values()].reduce((a, b) => a + b, 0)).padStart(10)}` +
      `${String(totalPassed).padStart(16)}${String(totalKept).padStart(15)}` +
      `${String([...inSupabase.values()].reduce((a, b) => a + b, 0)).padStart(11)}`,
  );
  if (totalPassed > 0) {
    console.log(`\n分级规则留下 ${totalKept} / ${totalPassed} 条（${((totalKept / totalPassed) * 100).toFixed(1)}%），其余 ${totalPassed - totalKept} 条被排除。`);
  }
  if (phaseDuplicateRows > 0) {
    console.log(
      `另有 ${phaseDuplicateRows} 行是同一标书的后续阶段（编号带 “(Presentación de oferta)” 之类的后缀，` +
        `mapper 会剥掉），已并入上面对应的那一条，没有重复计数。`,
    );
  }

  const newestAtSource = allDays.find((d) => (fetched.get(d) ?? 0) > 0);
  const newestInDb = allDays.find((d) => (inSupabase.get(d) ?? 0) > 0);
  const today = new Date().toISOString().slice(0, 10);

  console.log("\n结论：");
  console.log(`  今天                     ${today}`);
  console.log(`  源头最新一条的发布日     ${newestAtSource ?? "（这个窗口里一条都没有）"}`);
  console.log(
    `  我们库里最新一条的发布日 ${!dbMeasured ? "（没测到——这个 shell 没有 Supabase 凭据）" : (newestInDb ?? "（这个窗口里一条都没有）")}`,
  );
  if (dbMeasured && newestAtSource && newestInDb) {
    const lagDays = Math.round(
      (new Date(`${newestAtSource}T00:00:00Z`).getTime() - new Date(`${newestInDb}T00:00:00Z`).getTime()) / 86_400_000,
    );
    console.log(
      lagDays <= 0
        ? "  我们跟源头一样新——落后不是导入造成的。"
        : `  我们比源头落后 ${lagDays} 天。看上面哪一列先掉到 0，就是那一步丢的。`,
    );
  }
  // Columns 3 and 4 disagreeing has TWO causes, and they need opposite fixes,
  // so counting per day cannot answer it — the first real run showed 61
  // should-be-written against 29 stored, and also days where the DB held MORE
  // than today's rules would keep (09-03: 1 vs 2). Matching by slug does:
  //
  //   - Missing: the rules keep it, the database does not have it. An
  //     excluded row is NEVER WRITTEN (upsert-tenders skips it entirely), so
  //     when the rules later loosen — as they did twice today — reclassify
  //     cannot bring it back, because there is no row to reclassify. Only a
  //     re-import of that window can.
  //   - Stale: the database has it and today's rules would not keep it. That
  //     one IS reclassify's job; nothing needs re-fetching.
  if (dbMeasured && supabase) {
    const missing = [...keptBySlug.values()].filter((t) => !storedSlugs.has(t.slug));
    const staleCount = [...storedSlugs].filter((slug) => !keptBySlug.has(slug)).length;

    // "Missing" splits again, and the two halves need opposite actions. A
    // slug on tender_manual_deletions is BLOCKED: upsert-tenders filters it
    // out before the insert, on every import, forever — so re-importing does
    // nothing for it, and the row is invisible in a way nothing in the admin
    // UI surfaces (that table has no read or undo path anywhere in this
    // codebase — see npm run restore:deleted, added 2026-09-12 with this).
    // The first real run found 26 missing Colombia tenders next to a
    // "Skipping 22 tender(s) an admin previously deleted" line in the same
    // session's import log, which is exactly the confusion this separates.
    const blocked = new Set<string>();
    for (let i = 0; i < missing.length; i += 200) {
      const { data } = await supabase
        .from("tender_manual_deletions")
        .select("slug")
        .in("slug", missing.slice(i, i + 200).map((t) => t.slug));
      for (const row of (data ?? []) as { slug: string }[]) blocked.add(row.slug);
    }

    const neverImported = missing.filter((t) => !blocked.has(t.slug));
    const wasDeleted = missing.filter((t) => blocked.has(t.slug));

    // The reconciliation, stated as arithmetic, because the per-day columns
    // still cannot be subtracted even after the phase-row dedup above: a
    // procurement is attributed here to the day of the first source row seen
    // for it (rows arrive publication-date DESC, so the latest), while the
    // stored row carries whichever date the import that wrote it used. Same
    // procurement, two different days, one in each column. Only these totals
    // line up, so these are the numbers to read.
    console.log(
      `\n对账：源头这个窗口里有 ${keptBySlug.size} 个不同标书是规则要留的，` +
        `其中 ${keptBySlug.size - missing.length} 个已经在库里，${missing.length} 个不在。`,
    );
    console.log(
      `（上面那张表按天分，同一标书可能在表里算在某一天、在库里存着另一天，` +
        `所以第 3 列和第 4 列逐天相减没有意义 —— 看这一行的总数。）`,
    );

    console.log(`\n规则要留、库里没有：${missing.length} 条。分成两种：`);

    console.log(`\n  A. 从没写过库：${neverImported.length} 条 —— 重新导入这段时间就能拿回来。`);
    for (const tender of neverImported.slice(0, 15)) {
      console.log(`     ${tender.publicationDate.slice(0, 10)}  ${tender.relevance.tier.padEnd(11)} ${tender.title.es.slice(0, 72)}`);
    }
    if (neverImported.length > 15) console.log(`     …还有 ${neverImported.length - 15} 条。`);

    console.log(`\n  B. 被手动删除过：${wasDeleted.length} 条 —— 重新导入也不会回来，每次导入都会被挡掉。`);
    for (const tender of wasDeleted.slice(0, 15)) {
      console.log(`     ${tender.publicationDate.slice(0, 10)}  ${tender.relevance.tier.padEnd(11)} ${tender.title.es.slice(0, 72)}`);
      console.log(`       ${tender.slug}`);
    }
    if (wasDeleted.length > 15) console.log(`     …还有 ${wasDeleted.length - 15} 条。`);
    if (wasDeleted.length > 0) {
      console.log(`\n     想放回来：npm run restore:deleted -- <slug> [<slug>...]，然后重新导入。`);
    }

    console.log(`\n库里有、现在的规则不留：${staleCount} 条 —— 这些是入库时按旧规则判的，npm run reclassify:tenders 就能纠正。`);
  }

  // The gap between columns 2 and 3 is the whole story on this feed — the
  // first real run kept 61 of 579 — and a percentage cannot say whether the
  // other 518 were genuinely routine or whether a keyword is missing. The
  // titles can. Same medicine as discover-comprasmx-vigente.ts, for the same
  // reason: that gap has twice turned out to be a missing keyword.
  if (excluded.length > 0) {
    const path = writeReviewCsv({
      dir: "exports",
      baseName: `colombia-excluded-${new Date().toISOString().slice(0, 10)}`,
      csv: toCsv(REVIEW_CSV_HEADERS, excluded.map(reviewCsvRow)),
      label: "check-colombia-freshness",
    });
    if (path) console.log(`\n被排除的 ${excluded.length} 条标题已导出 -> ${path}`);
  }

  console.log(
    "\n怎么读这张表：「源头有」和「通过采购方式闸门」差很多 = 大部分是我们本来就不要的采购方式；" +
      "\n「通过闸门」和「规则判定值得写」差很多 = 分级规则筛掉的（值得导出来看一眼是不是漏了关键词）；" +
      "\n「规则判定值得写」有数但「已在库里」是 0 = 不要直接下结论，看上面「对账」那一行 —— 同一标书在两列里可能落在不同的天。",
  );
}

main();
