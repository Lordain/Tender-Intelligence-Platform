/**
 * Suriname's gov.sr 「Aanbestedingen」 — the dry run (user, 2026-10-16:
 * 苏里南做，先只在后台可见). Reads the category (one request: robots.txt asks
 * for 60 seconds between requests), reads each post and classifies it with
 * the platform's general rules. Writes nothing: writing, the daily job and
 * the admin tab come once the rules are agreed.
 *
 * Usage:
 *   npm run cron:suriname                                   (live, gov.sr)
 *   npm run cron:suriname -- --fixture lib/ingestion/__fixtures__/suriname/aanbestedingen-2026-10-16.json
 */
import { readFileSync } from "node:fs";
import { fetchSurinamePosts, type SurinamePost } from "../lib/ingestion/connectors/suriname-govsr-live";
import { parseSurinamePost } from "../lib/ingestion/suriname-notice";
import { mapSurinameNoticeToTender } from "../lib/ingestion/suriname-mapper";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const METHOD_LABEL: Record<string, string> = { icb: "国际招标", ncb: "国内招标", eoi: "咨询意向征询" };

function paramaribo(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Paramaribo" }).slice(0, 16);
}

async function main() {
  const fixtureIndex = process.argv.indexOf("--fixture");
  const posts: SurinamePost[] = fixtureIndex >= 0 ? JSON.parse(readFileSync(process.argv[fixtureIndex + 1], "utf8")) : await fetchSurinamePosts();
  const now = new Date();
  const rows = posts.map((post) => {
    const notice = parseSurinamePost(post);
    return { notice, tender: mapSurinameNoticeToTender(notice, now) };
  });

  const open = rows.filter((row) => row.notice.deadline && Date.parse(row.notice.deadline) >= now.getTime());
  const noDeadline = rows.filter((row) => !row.notice.deadline);
  const closed = rows.filter((row) => row.notice.deadline && Date.parse(row.notice.deadline) < now.getTime());
  console.log(`gov.sr 招标栏目共 ${rows.length} 条：仍在招标 ${open.length}，读不出截止日 ${noDeadline.length}，已截止 ${closed.length}。\n`);

  for (const [heading, group] of [["仍在招标", open], ["读不出截止日（要人工看）", noDeadline], ["已截止（只作规则参考）", closed]] as const) {
    if (group.length === 0) continue;
    console.log(`== ${heading} ==`);
    for (const { notice, tender } of group) {
      const tier = TIER_LABEL[tender.relevance.tier] ?? tender.relevance.tier;
      console.log(`  [${tier}] ${paramaribo(notice.publishedAt).slice(0, 10)} 截止 ${paramaribo(notice.deadline)} · ${notice.method ? METHOD_LABEL[notice.method] : "未写明方式"} · ${notice.financier ?? "出资方未写明"} · ${tender.scopeType}`);
      console.log(`         ${notice.title}`);
      console.log(`         行业 ${tender.industries.join("、") || "—"} · ${tender.relevance.reason.zh}`);
      console.log(`         ${notice.url}`);
    }
    console.log("");
  }
  console.log("试运行——什么都没写入。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
