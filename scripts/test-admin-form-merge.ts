/**
 * mergeServerChanges — the rule that decides what an admin's open form keeps
 * when router.refresh() delivers a newer version of the row.
 *
 * Exists because getting it wrong loses data in one direction or the other,
 * and neither failure is visible until someone notices a date they entered is
 * gone. The real bug (2026-09-14): a pasted cronograma wrote the bid deadline
 * to the database, the form went on holding the empty value it was built
 * with, and 保存修改 wrote the empty value back over it.
 *
 *   npm run test:admin-form-merge      (no network, no model calls)
 */
import { mergeServerChanges, sameFieldValue } from "../lib/admin/form-merge";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

type Row = {
  titleZh: string;
  submissionDeadline: string;
  awardDate: string;
  industries: string[];
};

const server: Row = { titleZh: "原标题", submissionDeadline: "", awardDate: "", industries: ["civil"] };

// The exact sequence that lost data.
{
  const afterPaste: Row = { ...server, submissionDeadline: "2026-10-12", awardDate: "2026-10-13" };
  const merged = mergeServerChanges({ ...server }, server, afterPaste);
  check("a pasted deadline reaches the open form", merged.submissionDeadline === "2026-10-12");
  check("so does the award date", merged.awardDate === "2026-10-13");
  check("and saving it back cannot blank them", merged.submissionDeadline !== "" && merged.awardDate !== "");
}

// The mirror-image bug re-seeding the whole form would cause.
{
  const editing: Row = { ...server, titleZh: "我改了一半的标题" };
  const afterPaste: Row = { ...server, submissionDeadline: "2026-10-12" };
  const merged = mergeServerChanges(editing, server, afterPaste);
  check("an unsaved title edit survives the refresh", merged.titleZh === "我改了一半的标题");
  check("…while the pasted deadline still lands", merged.submissionDeadline === "2026-10-12");
}

// A field the server changed wins even if the admin had touched it — rare,
// and the server value is the one that was actually persisted.
{
  const editing: Row = { ...server, submissionDeadline: "2026-01-01" };
  const afterPaste: Row = { ...server, submissionDeadline: "2026-10-12" };
  check(
    "a server change beats a local edit to the same field",
    mergeServerChanges(editing, server, afterPaste).submissionDeadline === "2026-10-12",
  );
}

// No server change at all: the admin's work must be returned untouched, and
// by identity, so React can skip the re-render.
{
  const editing: Row = { ...server, titleZh: "改了", awardDate: "2026-02-02" };
  const merged = mergeServerChanges(editing, server, { ...server });
  check("nothing changes when the server row is identical", merged === editing);
}

// industries is an array: two equal arrays are never the same object, so an
// identity comparison would overwrite the admin's selection on every refresh.
{
  const editing: Row = { ...server, industries: ["energy", "telecom"] };
  const merged = mergeServerChanges(editing, server, { ...server, industries: ["civil"] });
  check("an equal-but-not-identical array is not treated as a change", merged.industries.length === 2, JSON.stringify(merged.industries));
  check("…and a genuinely different array is", mergeServerChanges(editing, server, { ...server, industries: ["civil", "energy"] }).industries.length === 2);
  check("sameFieldValue compares arrays by value", sameFieldValue(["a", "b"], ["a", "b"]));
  check("…and still separates different ones", !sameFieldValue(["a", "b"], ["a", "c"]));
  check("…and different lengths", !sameFieldValue(["a"], ["a", "b"]));
}

// A field cleared on the server (an admin deleted the date elsewhere) has to
// clear here too — "" is a real value, not a missing one.
{
  const withDate: Row = { ...server, submissionDeadline: "2026-10-12" };
  const merged = mergeServerChanges({ ...withDate }, withDate, { ...withDate, submissionDeadline: "" });
  check("a date cleared on the server clears in the form", merged.submissionDeadline === "");
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
