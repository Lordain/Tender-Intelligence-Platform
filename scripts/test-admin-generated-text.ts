/**
 * The rules for an admin hand-editing the two strings visitors see —
 * title_zh_public and summary_zh_public.
 *
 * The pin rule is the reason this file exists. Clearing a bad public title is
 * an ordinary edit, and the admin route's diff records every edited column in
 * manual_field_overrides, which the generator is then forbidden to refill. An
 * empty PINNED public title falls back to title.zh — the administrative title,
 * carrying the Spanish project name — on every public page and in every
 * search result. That is the exact leak the column exists to prevent, caused
 * by the feature meant to fix it, and nothing about the page would look wrong.
 *
 *   npm run test:admin-generated-text      (no network, no model calls)
 */
import {
  generatedTextProblems,
  generatedTextRefusals,
  releaseClearedGeneratedText,
} from "../lib/admin/generated-text";

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

// ── The pin rule ────────────────────────────────────────────────────────────

// The trap: the diff pinned the column because clearing it IS an edit.
{
  const afterDiff = ["title_zh_public", "buyer"];
  const pins = releaseClearedGeneratedText(afterDiff, { title_zh_public: null, summary_zh_public: null });
  check("clearing the public title releases its pin", !pins.includes("title_zh_public"));
  check("…and leaves every other locked column alone", pins.includes("buyer"));
}

{
  const pins = releaseClearedGeneratedText(["summary_zh_public"], {
    title_zh_public: "墨西哥 变电站扩建工程",
    summary_zh_public: "   ",
  });
  check("whitespace counts as cleared", !pins.includes("summary_zh_public"));
}

// Writing one must NOT be released — that is the whole point of writing it.
{
  const pins = releaseClearedGeneratedText(["title_zh_public"], {
    title_zh_public: "墨西哥 变电站扩建工程",
    summary_zh_public: null,
  });
  check("a hand-written public title keeps its pin", pins.includes("title_zh_public"));
}

// This function only RELEASES. Pinning is the route's diff, so that merely
// opening the form and pressing save does not lock every title ever viewed.
{
  const pins = releaseClearedGeneratedText([], {
    title_zh_public: "墨西哥 变电站扩建工程",
    summary_zh_public: "这是一个变电站扩建工程。",
  });
  check("it never pins a column on its own", pins.length === 0, pins.join(","));
}

{
  const pins = releaseClearedGeneratedText(["b", "a"], { title_zh_public: null, summary_zh_public: null });
  check("the result is sorted, as the column expects", pins.join(",") === "a,b");
}

// ── The publishability rules ────────────────────────────────────────────────

// Empty is a release, not a failure — otherwise an admin could never hand a
// bad title back to the generator.
{
  check("an empty public title is not a refusal", generatedTextProblems("title_zh_public", "").length === 0);
  check("neither is an absent one", generatedTextProblems("summary_zh_public", null).length === 0);
}

// A hand-written value is published on the same pages as a generated one, so
// it clears the same bar. These are the shapes the column exists to stop.
{
  const withName = generatedTextProblems("title_zh_public", "墨西哥 马塔德罗（Matadero）泵站扩建工程");
  check("a hand-written title keeping the original name is refused", withName.length > 0, withName.join("；"));

  const masked = generatedTextProblems("title_zh_public", "墨西哥 ███ 变电站扩建工程");
  check("so is a masked one", masked.length > 0);

  const numbered = generatedTextProblems("title_zh_public", "秘鲁 医疗设备采购 20241301010259");
  check("so is one carrying a procurement number", numbered.length > 0);

  const meta = generatedTextProblems("summary_zh_public", "原文未列明具体设备，仅交代至这一层。");
  check("a summary talking about the source is refused", meta.length > 0);
}

// The good ones have to pass, or the feature is unusable.
{
  const title = generatedTextProblems("title_zh_public", "墨西哥 34.5kV 变电站扩建工程（输配电）");
  check("a real category title passes", title.length === 0, title.join("；"));

  const summary = generatedTextProblems(
    "summary_zh_public",
    "该项目为一座变电站的扩建工程，包含电气设备安装与配套土建，面向具备输配电施工资质的承包商。",
  );
  check("a real public summary passes", summary.length === 0, summary.join("；"));
}

// The API refuses with these strings, so they have to name the field.
{
  const refusals = generatedTextRefusals({
    title_zh_public: "墨西哥 马塔德罗（Matadero）泵站",
    summary_zh_public: "这是一个正常的摘要，讲清楚了工程内容和参与要求。",
  });
  check("a refusal names the offending field", refusals.length === 1 && refusals[0].startsWith("访客标题："), refusals.join(" | "));
  check("and says nothing about the field that passed", !refusals.join(" ").includes("访客摘要"));
}

{
  check("nothing submitted is nothing refused", generatedTextRefusals({}).length === 0);
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
