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
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { deriveTenderStatus } from "../lib/tender-status";
import { isClosedTender } from "../lib/access-control";
import { INDEXNOW_KEY, indexNowKeyPath, submitToIndexNow } from "../lib/indexnow";
import { siteOrigin } from "../lib/site-url";
import { participationGuides } from "../lib/participation-guides";
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

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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
  const origin = siteOrigin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86_400_000);

  if (origin.includes("localhost")) {
    throw new Error("APP_URL 没设置，现在指向 localhost —— 提交本地地址没有意义");
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase 没有配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），见 .env.example");
  }

  const { data, error } = await supabase
    .from("tenders")
    .select("slug, status, submission_deadline, publication_date, updated_at, tender_key_dates ( type, date )")
    .returns<Row[]>();
  if (error) throw new Error(`读取 tenders 失败：${error.message}`);

  const tenders = (data ?? []).filter((row) => {
    const derived = deriveTenderStatus(
      row.status,
      {
        submissionDeadline: row.submission_deadline,
        publicationDate: row.publication_date,
        keyDates: (row.tender_key_dates ?? []) as { type: never; date: string }[],
      },
      now,
    );
    if (!isClosedTender(derived)) return false;
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
