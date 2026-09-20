/**
 * The ANTAQ window rule, checked against the five real captures.
 *
 * What this exists to stop happening again: the window used to run on
 * `publishedAt`, which on gov.br is Plone's date for the PAGE, and ANTAQ
 * re-stamps it. Two of the five captures prove it on their own — see the
 * assertions below — so the rule is now pinned to dates the hearing states
 * about itself, and the page's own date only gets to warn.
 *
 * No network: every .gov.br host is outside this sandbox's egress allowlist,
 * and a test that only runs on a runner is a test that stops being run.
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  latestStatedDay,
  parseAntaqHearing,
  statedDays,
  type AntaqHearing,
} from "@/lib/ingestion/antaq-audiencia-parser";
import { judgeAntaqWindow } from "@/lib/ingestion/antaq-window";

const DIR = "lib/ingestion/__fixtures__/antaq";
/** The day the user ran the live harvest that exposed the re-stamp. */
const TODAY = new Date("2026-09-20T00:00:00Z");

let ran = 0;
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  ran += 1;
  const okay = JSON.stringify(actual) === JSON.stringify(expected);
  if (!okay) failures += 1;
  console.log(`${okay ? "✓" : "✗"} ${name}${okay ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}
function ok(name: string, condition: boolean, detail = "") {
  check(`${name}${detail === "" ? "" : ` ${detail}`}`, condition, true);
}

const hearings = new Map<string, AntaqHearing>();
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".html") && !f.startsWith("00-") && !f.startsWith("01-"))) {
  const hearing = parseAntaqHearing(readFileSync(`${DIR}/${file}`, "utf8"), `https://www.gov.br/${file}`);
  if (hearing !== null) hearings.set(hearing.number, hearing);
}
const at = (number: string) => hearings.get(number)!;

console.log("── 听证自己说的日期 ──");
check("五份页面都在", hearings.size, 5);
check("ITJ01 07/2026 最后一天", latestStatedDay(at("07/2026")), "2026-08-13");
check("06/2026 最后一天", latestStatedDay(at("06/2026")), "2026-10-14");
check("VDC04 04/2026 最后一天", latestStatedDay(at("04/2026")), "2026-07-03");
check("02/2026 最后一天", latestStatedDay(at("02/2026")), "2026-09-29");
check("SSB01 07/2025 最后一天", latestStatedDay(at("07/2025")), "2026-01-27");

// Both sources are read, and each covers for the other. The `até … dia`
// sentence on 02/2026 predates an extension the cronograma records; reading
// only that sentence would age the hearing by four months.
check("02/2026 的「até … dia」是 2026-05-02", at("02/2026").contributionsDeadline, "2026-05-02");
ok(
  "但它日程里的征询期排到 2026-09-29 —— 所以两处都得读",
  latestStatedDay(at("02/2026")) === "2026-09-29" && at("02/2026").contributionsDeadline === "2026-05-02",
);
// `29/06/2026 a 13/08/2026` is one cell holding two dates. parseBrazilianDate
// returns the first; a range silently becoming its start date is the quiet
// lie this platform has already paid for once with deadlines.
ok("日程里「X a Y」这种一格两个日期的，两个都取到了", statedDays(at("07/2026")).includes("2026-06-29") && statedDays(at("07/2026")).includes("2026-08-13"));
ok("日期是排好序的", statedDays(at("06/2026")).every((d, i, all) => i === 0 || all[i - 1] <= d));

console.log("\n── Plone 的发布日不算数，但会出声 ──");
// AP 07/2025's comment period closed 2026-01-27. Its page says published
// 2026-06-08 — five months later. This single row is why the window moved.
check("SSB01 07/2025 页面写着 2026-06-08 发布", at("07/2025").publishedAt, "2026-06-08");
ok("而它的征询期 2026-01-27 就结束了", latestStatedDay(at("07/2025")) === "2026-01-27");
ok("所以它被标出来了", judgeAntaqWindow(at("07/2025"), 2, TODAY).pageStampWarning !== undefined);
for (const number of ["07/2026", "06/2026", "04/2026", "02/2026"]) {
  ok(`${number} 页面日期和自己说的对得上，不报警`, judgeAntaqWindow(at(number), 2, TODAY).pageStampWarning === undefined);
}

console.log("\n── 窗口按场次号的年份算 ──");
for (const number of ["07/2026", "06/2026", "04/2026", "02/2026", "07/2025"]) {
  const v = judgeAntaqWindow(at(number), 2, TODAY);
  ok(`--years 2：${number} 留下`, v.inWindow, `（${v.why}）`);
}
check("07/2025 是靠场次号留下的，不是靠日程捞回来的", judgeAntaqWindow(at("07/2025"), 2, TODAY).rescuedBySchedule, false);

// The rescue, on a real row: at --years 1 the number says 2025 and is out,
// but the hearing's own schedule ran into 2026, so it comes back.
const narrow = judgeAntaqWindow(at("07/2025"), 1, TODAY);
ok("--years 1：07/2025 按号该丢，但日程排到 2026-01-27，捞回来了", narrow.inWindow && narrow.rescuedBySchedule);
ok("捞回来的理由说得出来", /2026-01-27/.test(narrow.why));
for (const number of ["07/2026", "06/2026", "04/2026", "02/2026"]) {
  ok(`--years 1：${number} 本来就是今年的`, judgeAntaqWindow(at(number), 1, TODAY).inWindow);
}
for (const number of [...hearings.keys()]) {
  ok(`--years 0：${number} 不设窗口`, judgeAntaqWindow(at(number), 0, TODAY).inWindow);
}
check("--years 0 的理由", judgeAntaqWindow(at("07/2025"), 0, TODAY).why, "未设窗口");

console.log("\n── 被重新盖章的旧场次（AP 03/2024 那一类）──");
// The shape the user's live run turned up: a 2024 hearing whose page carries a
// 2026 effective date and whose URL sits under `audiencias-encerradas`. Under
// the old rule it passed a 12-month window on the strength of the re-stamp
// alone. It is built here rather than captured because its page was never
// fetched — what is asserted is the rule, not that page's contents.
const restamped: AntaqHearing = {
  number: "03/2024",
  year: 2024,
  heading: "Audiência Pública nº 03/2024 - ANTAQ",
  subject: "CONCESSÃO DO PORTO ORGANIZADO DE ITAJAÍ/SC",
  publishedAt: "2026-07-06",
  updatedAt: "2026-07-06",
  schedule: [],
  notices: [],
  documentSections: [],
  sourceUrl: "https://www.gov.br/antaq/.../audiencias-encerradas/audiencia-publica-ndeg-03-2024",
};
const old = judgeAntaqWindow(restamped, 2, TODAY);
ok("--years 2：按号是 2024 年的，丢", !old.inWindow);
ok("而且说清楚是按什么丢的", /2024/.test(old.why) && /2025/.test(old.why), `（${old.why}）`);
ok("同时点出页面日期是重新盖的章", old.pageStampWarning !== undefined && /2026-07-06/.test(old.pageStampWarning!));
ok("--years 3 就能捞到它", judgeAntaqWindow(restamped, 3, TODAY).inWindow);

// And the case the old rule got backwards: a re-stamped page whose hearing
// states dates of its own, all of them old. Plone says this year; the hearing
// says 2023. The hearing wins.
const restampedWithSchedule: AntaqHearing = {
  ...restamped,
  number: "01/2023",
  year: 2023,
  contributionsDeadline: "2023-11-30",
  schedule: [{ order: "1", event: "Consulta Pública", when: "01/10/2023 a 30/11/2023" }],
};
const stale = judgeAntaqWindow(restampedWithSchedule, 2, TODAY);
ok("页面今年重新发过，但听证自己的日期全在 2023 —— 丢", !stale.inWindow);
check("丢的时候把它自己最后一天报出来", stale.lastStatedDay, "2023-11-30");
ok("并说明页面日期不算数", stale.pageStampWarning !== undefined);

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
