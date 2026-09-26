/**
 * The rules lib/ingestion/award-results.ts writes 中标结果 by — no network, no
 * database: writeAwardResults() is run with write:false, which decides every
 * fill without touching Supabase.
 *
 * Usage: npm run test:award-results
 */
import {
  awardDay,
  combineAwardParts,
  formatSuppliers,
  writeAwardResults,
  type AwardCandidate,
} from "@/lib/ingestion/award-results";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

function candidate(slug: string, extra: Partial<AwardCandidate> = {}): AwardCandidate {
  return {
    id: slug,
    slug,
    tender_number: slug,
    title: { es: slug },
    publication_date: "2026-06-01",
    submission_deadline: null,
    award_date: null,
    awarded_to: null,
    awarded_value: null,
    estimated_value: null,
    currency: "MXN",
    source_url: null,
    manual_field_overrides: null,
    ...extra,
  };
}

async function main() {
  console.log("award-results\n");

  check("awardDay reads ISO timestamps", awardDay("2026-07-09T17:55:20Z"), "2026-07-09");
  check("awardDay reads dd/mm/yyyy", awardDay("09/07/2026"), "2026-07-09");
  check("awardDay refuses anything else", awardDay("julio"), null);

  const lots = combineAwardParts("x", [
    { supplier: "CONSORCIO A", amount: 100, currency: "COP", date: "2026-08-01" },
    { supplier: "consorcio a ", amount: 50, currency: "COP", date: "2026-08-27" },
    { supplier: "No Definido" },
  ]);
  check("winners are de-duplicated case-insensitively, 'No Definido' dropped", lots.suppliers, ["CONSORCIO A"]);
  check("amounts of several lots are summed", lots.amount, 150);
  check("the latest award date wins", lots.awardDate, "2026-08-27");
  check("mixed currencies leave the amount out", combineAwardParts("x", [{ amount: 1, currency: "PEN" }, { amount: 2, currency: "USD" }]).amount, undefined);
  check("five winners are named three and counted", formatSuppliers(["A", "B", "C", "D", "E"]), "A；B；C 等 5 家");

  const now = new Date("2026-09-26T12:00:00Z");
  const result = await writeAwardResults(
    null as never,
    [
      candidate("planned", { award_date: "2026-10-16" }),
      candidate("future"),
      candidate("kept", { awarded_to: "HAND ENTERED", awarded_value: 7 }),
      candidate("locked", { manual_field_overrides: ["award_date", "awarded_to", "awarded_value"] }),
      candidate("usd", { currency: "PEN" }),
      candidate("nocurrency", { currency: null }),
      candidate("unasked"),
    ],
    [
      { slug: "planned", awardDate: "2026-07-22", suppliers: ["CONSTRUCTORA GERMER SA DE CV"], amount: 83651363.77, currency: "MXN" },
      { slug: "future", awardDate: "2026-09-30", suppliers: [], amount: 10, currency: "MXN" },
      { slug: "kept", suppliers: ["SOMEONE ELSE"], amount: 9, currency: "MXN" },
      { slug: "locked", awardDate: "2026-07-01", suppliers: ["X"], amount: 1, currency: "MXN" },
      { slug: "usd", suppliers: [], amount: 5, currency: "USD" },
      { slug: "nocurrency", suppliers: [], amount: 5, currency: "CLP" },
    ],
    { write: false, now },
  );
  const fill = (slug: string) => result.filled.find((f) => f.slug === slug);
  check("an actual award date replaces the planned one", fill("planned")?.awardDate, "2026-07-22");
  check("supplier and amount fill empty columns", [fill("planned")?.awardedTo, fill("planned")?.awardedValue], ["CONSTRUCTORA GERMER SA DE CV", 83651363.77]);
  check("a future award date is a schedule, not a result", fill("future")?.awardDate, undefined);
  check("…but the amount beside it is still filled", fill("future")?.awardedValue, 10);
  check("a stored supplier or amount is never replaced", fill("kept"), undefined);
  check("columns an admin edited are left alone", [fill("locked"), result.protectedSlugs], [undefined, ["locked"]]);
  check("an amount in another currency is not written", [fill("usd"), result.currencyMismatch], [undefined, ["usd（USD ≠ PEN）"]]);
  check("a tender with no currency takes the award's", [fill("nocurrency")?.awardedValue, fill("nocurrency")?.currency], [5, "CLP"]);
  check("counts: candidates / observed / filled", [result.candidates, result.observedCount, result.filled.length], [7, 6, 3]);

  console.log(failures === 0 ? "\n全部通过。" : `\n${failures} 项失败。`);
  if (failures) process.exit(1);
}

main();
