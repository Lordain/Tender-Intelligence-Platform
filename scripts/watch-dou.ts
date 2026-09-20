/**
 * 定向监控巴西联邦官方公报（DOU）—— reports what is worth a look, and writes
 * nothing.
 *
 * ── Why a watch and not an import ─────────────────────────────────────────
 *
 * Measured on the captured edition: `content` is cut at 403 characters and
 * 211 of 216 sampled notices end in an ellipsis. A DOU notice carries no
 * deadline, no value, and half an object description. Turning one into a
 * `Tender` would manufacture exactly the row this platform has already paid
 * for twice — a truncated summary with no submission date — and it would do
 * it to the highest-value rows, because a concession notice is the longest.
 *
 * So this narrows 2,139 notices a day down to a handful, prints them with
 * their permalinks, and leaves the import to a person or to a second fetch of
 * the full text. That is what 定向监控 means here.
 *
 * ── Why it filters locally instead of searching ───────────────────────────
 *
 * in.gov.br's own full-text search was captured twice and came back noise:
 * `q=concessão` returned a tax-credit Instrução Normativa, `q=aviso de
 * licitação` returned an Embrapa scholarship, and every row scored 0. See
 * lib/ingestion/dou-watch.ts. The edition listing carries `artType` and the
 * full publishing hierarchy per notice, so the targeting happens here against
 * fields that mean something.
 *
 * ── Running it where in.gov.br answers ────────────────────────────────────
 *
 * `in.gov.br` opens to the GitHub runner and to Vercel and closes the socket
 * on the user's laptop; it is outside the agent sandbox's allowlist entirely.
 * `--fixture` runs the whole pipeline against the committed sample instead,
 * so the rules can be read and changed from any machine.
 *
 * Usage:
 *   npm run watch:dou -- --fixture                  （用仓库里那份真实样本跑，不联网）
 *   npm run watch:dou                               （最近 1 个工作日，第三节）
 *   npm run watch:dou -- --days 5
 *   npm run watch:dou -- --section do1              （法令与授权，特许经营的最早信号）
 *   npm run watch:dou -- --all-organs               （不限机构）
 *   npm run watch:dou -- --organs "Ministério dos Transportes,Ministério das Cidades"
 *   npm run watch:dou -- --stages opening,amendment,closing
 *   npm run watch:dou -- --forms works_or_concession
 *   npm run watch:dou -- --keyword concessão
 *   npm run watch:dou -- --include-prefeituras      （把市政公告也放进来，PNCP 已全量收）
 *   npm run watch:dou -- --show-dropped             （连丢掉的也列出来，调规则时用）
 */
import { readFileSync } from "node:fs";
import { fetchDouEdition, isDouUnreachable, recentWeekdays, type DouDayResult } from "../lib/ingestion/connectors/dou-live";
import { douEditionUrl, douNoticeUrl, readDouPayload, DOU_SECTIONS, type DouSection } from "../lib/ingestion/dou-edition";
import {
  watchDouEdition,
  DOU_WATCHED_ORGANS,
  type DouProcurementForm,
  type DouStage,
  type DouWatchOptions,
} from "../lib/ingestion/dou-watch";

/** The committed sample, so `--fixture` needs no argument in the usual case. */
const DEFAULT_FIXTURE = "lib/ingestion/__fixtures__/dou/do3-data-json-1.json";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  const next = idx >= 0 ? args[idx + 1] : undefined;
  return next !== undefined && !next.startsWith("--") ? next : undefined;
}

function list(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((p) => p.trim()).filter((p) => p !== "");
  return parts.length > 0 ? parts : undefined;
}

function main0(): { args: string[]; section: DouSection; options: DouWatchOptions } {
  const args = process.argv.slice(2);
  const sectionRaw = (argValue(args, "--section") ?? "do3") as DouSection;
  if (!DOU_SECTIONS.includes(sectionRaw)) {
    console.error(`--section 只认 ${DOU_SECTIONS.join(" / ")}，收到的是 "${sectionRaw}"`);
    process.exit(1);
  }
  const options: DouWatchOptions = {
    // `--all-organs` is an empty watchlist, which dou-watch reads as "any
    // organ that is not on the never-watched list" — the never-watched list
    // still applies, because `--all-organs` means "widen the target", not
    // "show me 64 municipal notices".
    organs: args.includes("--all-organs") ? [] : list(argValue(args, "--organs")),
    stages: list(argValue(args, "--stages")) as DouStage[] | undefined,
    forms: list(argValue(args, "--forms")) as DouProcurementForm[] | undefined,
    keyword: argValue(args, "--keyword"),
    includePrefeituras: args.includes("--include-prefeituras"),
  };
  return { args, section: sectionRaw, options };
}

function reportDay(result: DouDayResult, options: DouWatchOptions, showDropped: boolean): number {
  const { edition } = result;
  const report = watchDouEdition(edition.notices, options);

  console.log(`\n════ ${result.day} · ${result.section.toUpperCase()} ════`);
  console.log(`  ${result.url}`);
  if (edition.sampleNote !== undefined) {
    // Never let a sample's count read as a day's total. The committed file is
    // 216 of 2,139, flattened two-per-organ on purpose, so every proportion
    // computed from it is wrong in a known direction.
    console.log(`  ⚠ 这是仓库里的裁剪样本，不是完整一天：${edition.notices.length} 条（原 ${edition.sampledFrom ?? "?"} 条）`);
    console.log(`    每个 artType 取 2 条、每个一级机构取 2 条 —— 所以这里的比例不能当成真实比例。`);
  } else {
    console.log(`  读到 ${edition.notices.length} 条公告`);
  }

  if (report.kept.length === 0) {
    console.log(`\n  没有命中的。`);
  }
  for (const v of report.kept) {
    console.log(`\n★ [${v.stage}/${v.form}] ${v.notice.organPath}`);
    console.log(`  ${v.notice.title}`);
    console.log(`  ${v.notice.snippet.slice(0, 300)}`);
    console.log(`  ${v.notice.publishedOn ?? result.day} · ${v.notice.pubName} 第 ${v.notice.editionNumber ?? "?"} 期 第 ${v.notice.page ?? "?"} 页${v.industries.length > 0 ? ` · ${v.industries.join("/")}` : ""}`);
    console.log(`  ${douNoticeUrl(v.notice)}`);
  }

  console.log(`\n  命中 ${report.kept.length} / ${edition.notices.length}。丢弃原因：`);
  for (const d of report.droppedBy.slice(0, 12)) console.log(`    ${String(d.count).padStart(4)}  ${d.reason}`);
  if (report.droppedBy.length > 12) console.log(`    …另有 ${report.droppedBy.length - 12} 类`);

  if (showDropped) {
    console.log(`\n  ── 丢掉的 ${report.dropped.length} 条 ──`);
    for (const v of report.dropped) console.log(`    [${v.stage}/${v.form}] ${v.notice.title.slice(0, 60)} — ${v.why}`);
  }
  return report.kept.length;
}

async function main() {
  const { args, section, options } = main0();
  const showDropped = args.includes("--show-dropped");

  console.log("DOU 定向监控 —— 只报告，不写库");
  console.log(`  版面 ${section.toUpperCase()}　机构 ${options.organs === undefined ? `默认 ${DOU_WATCHED_ORGANS.length} 个部委` : options.organs.length === 0 ? "不限（仍排除市政/司法/审计等）" : options.organs.join(" / ")}`);
  console.log(`  阶段 ${options.stages?.join(" / ") ?? "opening / amendment（默认）"}　采购方式 ${options.forms?.join(" / ") ?? "works_or_concession / unknown（默认）"}${options.keyword ? `　关键词「${options.keyword}」` : ""}`);

  if (args.includes("--fixture")) {
    const path = argValue(args, "--fixture") ?? DEFAULT_FIXTURE;
    const edition = readDouPayload(JSON.parse(readFileSync(path, "utf8")));
    const day = edition.publishedOn ?? "（样本里没有日期）";
    console.log(`\n用样本文件跑：${path}`);
    reportDay({ day, section, url: edition.publishedOn ? douEditionUrl(section, edition.publishedOn) : path, edition }, options, showDropped);
    console.log("\n（--fixture 不联网。要看真实当天，去掉这个参数，在能打开 in.gov.br 的机器上跑。）");
    return;
  }

  const daysRaw = argValue(args, "--days");
  const days = daysRaw === undefined ? 1 : Number(daysRaw);
  if (!Number.isFinite(days) || days < 1) {
    console.error(`--days 认不出来："${daysRaw}"。给 1 以上的整数。`);
    process.exit(1);
  }

  let total = 0;
  let reached = 0;
  for (const day of recentWeekdays(days)) {
    try {
      const result = await fetchDouEdition(section, day);
      reached += 1;
      total += reportDay(result, options, showDropped);
    } catch (err) {
      if (!isDouUnreachable(err)) throw err;
      console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (reached === 0) {
    // Never report an unreachable source as an empty one — the two need
    // opposite fixes, and in.gov.br is reachable from the runner and from
    // Vercel while refusing the laptop and this sandbox outright.
    console.error("\n一天都没读到。这是「够不着」，不是「公报里没东西」：");
    console.error("  in.gov.br 对 GitHub 跑批机和 Vercel 是开的，对笔记本会读到一半断开，沙箱里根本不在白名单。");
    console.error("  想在本机看规则跑得对不对：npm run watch:dou -- --fixture");
    process.exit(1);
  }
  console.log(`\n${reached} 个工作日，合计命中 ${total} 条。什么都没有写入数据库 —— 这是监控，不是导入。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
