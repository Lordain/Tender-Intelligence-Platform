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

  for (const row of rows) {
    const day = dayOf(row.fecha_de_publicacion_del);
    bump(fetched, day);
    if (!isIngestedColombiaModalidad(row.modalidad_de_contratacion)) continue;
    bump(passedModalidad, day);
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (tender && tender.relevance.tier !== "excluded") bump(wouldBeWritten, day);
  }

  const inSupabase = new Map<string, number>();
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("tenders")
      .select("publication_date")
      .eq("source_name", SOURCE_NAME)
      .gte("publication_date", since.toISOString().slice(0, 10))
      .limit(5000);
    if (error) console.error(`Could not read Supabase: ${error.message}`);
    for (const row of data ?? []) bump(inSupabase, dayOf((row as { publication_date: string }).publication_date));
  } else {
    console.error("Supabase isn't configured — the last column will be blank.\n");
  }

  const allDays = [...new Set([...fetched.keys(), ...inSupabase.keys()])].sort().reverse();

  console.log("发布日          源头有   通过采购方式闸门   规则判定值得写   已在库里");
  console.log("──────────────────────────────────────────────────────────────────────");
  for (const day of allDays) {
    const cells = [
      String(fetched.get(day) ?? 0).padStart(6),
      String(passedModalidad.get(day) ?? 0).padStart(14),
      String(wouldBeWritten.get(day) ?? 0).padStart(15),
      String(inSupabase.get(day) ?? 0).padStart(11),
    ];
    console.log(`${day}  ${cells.join("")}`);
  }

  const newestAtSource = allDays.find((d) => (fetched.get(d) ?? 0) > 0);
  const newestInDb = allDays.find((d) => (inSupabase.get(d) ?? 0) > 0);
  const today = new Date().toISOString().slice(0, 10);

  console.log("\n结论：");
  console.log(`  今天                     ${today}`);
  console.log(`  源头最新一条的发布日     ${newestAtSource ?? "（这个窗口里一条都没有）"}`);
  console.log(`  我们库里最新一条的发布日 ${newestInDb ?? "（这个窗口里一条都没有）"}`);
  if (newestAtSource && newestInDb) {
    const lagDays = Math.round(
      (new Date(`${newestAtSource}T00:00:00Z`).getTime() - new Date(`${newestInDb}T00:00:00Z`).getTime()) / 86_400_000,
    );
    console.log(
      lagDays <= 0
        ? "  我们跟源头一样新——落后不是导入造成的。"
        : `  我们比源头落后 ${lagDays} 天。看上面哪一列先掉到 0，就是那一步丢的。`,
    );
  }
  console.log(
    "\n怎么读这张表：「源头有」和「通过采购方式闸门」差很多 = 大部分是我们本来就不要的采购方式；" +
      "\n「通过闸门」和「规则判定值得写」差很多 = 分级规则筛掉的（值得导出来看一眼是不是漏了关键词）；" +
      "\n「规则判定值得写」有数但「已在库里」是 0 = 单纯没导入，去后台点一下。",
  );
}

main();
