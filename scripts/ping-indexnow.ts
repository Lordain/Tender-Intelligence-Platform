/**
 * Pushes newly-public pages to IndexNow, so Bing — and through it ChatGPT and
 * Copilot — learns about them the day they appear instead of whenever a
 * crawler next happens by.
 *
 * WHAT IS "NEWLY PUBLIC" HERE, AND WHY IT IS NOT JUST "NEW"
 *
 * A tender page becomes readable by everyone the moment it CLOSES (see
 * canOpenTenderDetail, 2026-09-15). Nothing writes to the row when that
 * happens — the status is derived from the calendar on every read — so the
 * day a page turns into indexable content is a day on which the database
 * shows no change at all. A "submit what changed since yesterday" rule based
 * on updated_at would therefore miss precisely the pages this exists for.
 * So a tender qualifies when it is closed AND either its row changed inside
 * the window or its deadline fell inside the window.
 *
 * Still-biddable tenders are never submitted: a crawler asking for one gets
 * the 订阅后查看 prompt, exactly as app/sitemap.ts and the page's own
 * robots directive already decided.
 *
 * Usage:
 *   npm run ping:indexnow                   (dry run — prints the URLs, submits nothing)
 *   npm run ping:indexnow -- --write        (submits)
 *   npm run ping:indexnow -- --days 7       (widen the window; default 2)
 *   npm run ping:indexnow -- --all          (every indexable URL, including the static pages — for the first run)
 *   npm run ping:indexnow -- --origin https://latintender.com
 *
 * On --origin: the site's address normally comes from APP_URL, which a local
 * .env.local deliberately does NOT set to production — the same variable
 * builds Stripe's return URLs and the digest email links, so pointing it at
 * latintender.com just to run this would send a local Checkout test back to
 * the live site. Pass the origin for this one command instead.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { deriveTenderStatus } from "../lib/tender-status";
import { isClosedTender } from "../lib/access-control";
import { INDEXNOW_KEY, indexNowKeyPath, submitToIndexNow } from "../lib/indexnow";
import { siteOrigin } from "../lib/site-url";
import { participationGuides } from "../lib/participation-guides";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderStatus } from "../types/tender";

type Row = {
  slug: string;
  status: TenderStatus;
  submission_deadline: string | null;
  publication_date: string | null;
  updated_at: string | null;
  tender_key_dates: { type: string; date: string }[] | null;
};

const STATIC_PATHS = [
  "/",
  "/tenders",
  "/guides",
  ...participationGuides.map((guide) => `/guides/${guide.slug}`),
  "/pricing",
  "/clarifications",
];

/**
 * Supabase caps an unbounded select at 1000 rows and says nothing about it,
 * so this pages the way lib/db/tenders.ts does. Without it a table of several
 * thousand tenders silently returns an arbitrary first slice — which is how a
 * run can report "0 closed tenders" on a database full of them.
 */
const PAGE_SIZE = 1000;

async function readAllTenders(supabase: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, status, submission_deadline, publication_date, updated_at, tender_key_dates ( type, date )")
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .returns<Row[]>();
    if (error) throw new Error(`读取 tenders 失败：${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * An "awarded" tender with no analysis logged is hidden from every public
 * surface (fetchAllTendersFromDb's visibility rule, 2026-09-05) and is
 * therefore absent from the sitemap. Submitting it here would tell Bing about
 * a page this site does not otherwise admit exists — and the page itself is
 * an empty result with nothing to read.
 */
async function awardedSlugsWithoutAnalysis(supabase: SupabaseClient): Promise<Set<string>> {
  const hidden = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_requirements ( id ), tender_risks ( id )")
      .eq("status", "awarded")
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ slug: string; tender_requirements: { id: string }[]; tender_risks: { id: string }[] }[]>();
    if (error) throw new Error(`读取已授标项目失败：${error.message}`);
    const page = data ?? [];
    for (const row of page) {
      if (row.tender_requirements.length === 0 && row.tender_risks.length === 0) hidden.add(row.slug);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return hidden;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function text(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1]?.trim() || undefined;
}

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Refuses to submit against a key file the site is not actually serving.
 * IndexNow answers 403 in that case and drops the whole batch, which from the
 * caller's side looks identical to "nothing needed submitting" — so this
 * checks first and says which of the two it is.
 */
async function verifyKeyFile(origin: string): Promise<void> {
  const url = `${origin}${indexNowKeyPath()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`密钥文件 ${url} 返回 ${response.status}；先部署 public/${INDEXNOW_KEY}.txt 再提交`);
  }
  const body = (await response.text()).trim();
  if (body !== INDEXNOW_KEY) {
    throw new Error(`密钥文件 ${url} 的内容和 lib/indexnow.ts 里的 key 不一致`);
  }
}

async function main() {
  const write = flag("write");
  const all = flag("all");
  const days = option("days", 2);
  const origin = text("origin") ? new URL(text("origin")!).origin : siteOrigin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86_400_000);

  if (origin.includes("localhost")) {
    throw new Error(
      "站点地址指向 localhost —— 提交本地地址没有意义。加 --origin https://latintender.com，或在环境里设 APP_URL。",
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase 没有配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），见 .env.example");
  }

  const rows = await readAllTenders(supabase);
  const hidden = await awardedSlugsWithoutAnalysis(supabase);
  const closed = rows.filter((row) =>
    !hidden.has(row.slug) &&
    isClosedTender(
      deriveTenderStatus(
        row.status,
        {
          submissionDeadline: row.submission_deadline,
          publicationDate: row.publication_date,
          keyDates: (row.tender_key_dates ?? []) as { type: never; date: string }[],
        },
        now,
      ),
    ),
  );

  const tenders = closed.filter((row) => {
    if (all) return true;
    const changed = row.updated_at ? new Date(row.updated_at) >= cutoff : false;
    const justClosed = row.submission_deadline
      ? new Date(row.submission_deadline) >= cutoff && new Date(row.submission_deadline) <= now
      : false;
    return changed || justClosed;
  });

  const urls = [
    ...(all ? STATIC_PATHS.map((path) => `${origin}${path === "/" ? "" : path}` || origin) : []),
    ...tenders.map((row) => `${origin}/tenders/${row.slug}`),
  ];

  console.log(`站点：${origin}`);
  console.log(all ? "范围：全部可收录页面" : `范围：最近 ${days} 天内更新或刚刚截止的项目`);
  // Says why the answer is zero. A run that submits no tender page is either
  // "nothing closed since yesterday" (normal) or "this database holds no
  // closed tenders at all" (something to look at) — and without these two
  // counts the two look identical from the outside.
  console.log(`数据库共 ${rows.length} 个项目，其中已截止（可收录）${closed.length} 个`);
  if (hidden.size > 0) console.log(`（另有 ${hidden.size} 个已授标但尚未录入分析的项目，公开列表本来就不显示，不提交）`);
  if (closed.length === 0 && rows.length > 0) {
    console.log("没有任何已截止项目 —— 检查是不是被 purge:closed-tenders 清掉了，或者截止日期普遍为空");
  }
  console.log(`待提交：${urls.length} 个地址`);
  for (const url of urls.slice(0, 20)) console.log(`  ${url}`);
  if (urls.length > 20) console.log(`  …… 其余 ${urls.length - 20} 个`);

  if (urls.length === 0) {
    console.log("没有变化，不提交。");
    return;
  }
  if (!write) {
    console.log("\n试运行，没有提交。加 --write 才真的提交。");
    return;
  }

  await verifyKeyFile(origin);
  const result = await submitToIndexNow(origin, urls);
  console.log(`\nIndexNow 返回 ${result.status}${result.body ? `：${result.body}` : ""}`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
