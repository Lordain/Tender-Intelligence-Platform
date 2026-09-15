/**
 * Pushes newly-public pages to IndexNow, so Bing — and through it ChatGPT and
 * Copilot — learns about them the day they appear instead of whenever a
 * crawler next happens by.
 *
 * WHAT IS PUBLIC HERE
 *
 * Every tender page exposes a Chinese title, summary and procurement facts to
 * crawlers while keeping the document analysis and official-entry details out
 * of the public payload. Therefore every new or updated tender URL qualifies;
 * --all performs the one-time submission of the existing inventory.
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
import { INDEXNOW_KEY, indexNowKeyPath, submitToIndexNow } from "../lib/indexnow";
import { siteOrigin } from "../lib/site-url";
import { participationGuides } from "../lib/participation-guides";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = {
  public_slug: string;
  publication_date: string | null;
  updated_at: string | null;
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
      .select("public_slug, publication_date, updated_at")
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
  const tenders = rows.filter((row) => {
    if (all) return true;
    const changed = row.updated_at ? new Date(row.updated_at) >= cutoff : false;
    const published = row.publication_date ? new Date(row.publication_date) >= cutoff : false;
    return changed || published;
  });

  const urls = [
    ...(all ? STATIC_PATHS.map((path) => `${origin}${path === "/" ? "" : path}` || origin) : []),
    ...tenders.map((row) => `${origin}/tenders/${row.public_slug}`),
  ];

  console.log(`站点：${origin}`);
  console.log(all ? "范围：全部可收录页面" : `范围：最近 ${days} 天内发布或更新的项目`);
  console.log(`数据库共 ${rows.length} 个项目，本次符合条件 ${tenders.length} 个`);
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
