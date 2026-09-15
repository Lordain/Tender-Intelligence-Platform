/**
 * Is there a Colombian source worth adding beyond SECOP II?
 *
 * The user's question (2026-09-15): SECOP I, TVEC (Tienda Virtual del
 * Estado Colombiano), 州政府 —— which of those exist as real, importable
 * data, and how big are they? Answering that from memory is exactly how a
 * connector gets built against a dataset id that does not exist, so this
 * script does not hardcode an answer: it ASKS Socrata's own catalog which
 * datasets datos.gov.co publishes, then probes each candidate for the three
 * things that decide whether a connector is viable at all —
 *
 *   1. Does the plain unauthenticated `/resource/<id>.json` path answer?
 *      (The `/api/views/...` path needs a token; the SODA2 path does not —
 *      see colombia-mapper.ts's header.)
 *   2. How many rows, and how many in the last 90 days? A dataset with
 *      millions of historical rows but nothing recent is an archive, not a
 *      feed, and a feed is what this platform needs.
 *   3. What columns? A source with no procedure name, no buyer and no
 *      deadline cannot be mapped to a Tender no matter how many rows it has.
 *
 * Read-only, no Supabase, no writes. Prints a verdict per dataset.
 *
 * Usage:
 *   npm run probe:colombia-sources
 *   npm run probe:colombia-sources -- --q=TVEC        (换个搜索词)
 *   npm run probe:colombia-sources -- --columns       (把每个数据集的字段名全列出来)
 */
const CATALOG_URL = "https://api.us.socrata.com/api/catalog/v1";
const DOMAIN = "www.datos.gov.co";
const RESOURCE_BASE = "https://www.datos.gov.co/resource";

const args = process.argv.slice(2);
const SHOW_COLUMNS = args.includes("--columns");
const QUERIES = args
  .filter((a) => a.startsWith("--q="))
  .map((a) => a.split("=").slice(1).join("="));

/**
 * Deliberately several narrow searches rather than one broad one: Socrata's
 * catalog relevance is keyword-based, and "SECOP" alone buries TVEC (whose
 * titles say "Tienda Virtual", never "SECOP") under a hundred SECOP rows.
 */
const DEFAULT_QUERIES = ["SECOP", "Tienda Virtual del Estado Colombiano", "ordenes de compra"];

/**
 * Datasets this project already reads, probed alongside the candidates as a
 * control. If a known-good id comes back unreachable, the network is the
 * problem and every other verdict in this run is meaningless — that is worth
 * knowing before anyone acts on a "TVEC is unreachable" line.
 */
const KNOWN_GOOD: { id: string; label: string }[] = [
  { id: "p6dx-8zbt", label: "SECOP II — Procesos de Contratación（本站正在用）" },
  { id: "dmgg-8hin", label: "SECOP II — 附件元数据（本站正在用）" },
];

type CatalogHit = { id: string; name: string; description: string };

async function searchCatalog(query: string): Promise<CatalogHit[]> {
  const url = new URL(CATALOG_URL);
  url.searchParams.set("domains", DOMAIN);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  url.searchParams.set("only", "dataset");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Socrata 目录返回 ${response.status} ${response.statusText}`);
  const data = (await response.json()) as { results?: { resource?: { id?: string; name?: string; description?: string } }[] };
  return (data.results ?? [])
    .map((r) => ({ id: r.resource?.id ?? "", name: r.resource?.name ?? "(无名)", description: (r.resource?.description ?? "").replace(/\s+/g, " ").slice(0, 160) }))
    .filter((hit) => hit.id);
}

type Probe = {
  id: string;
  label: string;
  reachable: boolean;
  note?: string;
  totalRows?: number;
  recentRows?: number;
  recentColumn?: string;
  columns?: string[];
};

/** Column names a Socrata procurement dataset plausibly dates rows by, most specific first. Probed in order; the first one the server accepts is the one reported. */
const DATE_COLUMN_CANDIDATES = [
  "fecha_de_publicacion_del",
  "fecha_de_publicacion",
  "fecha_publicacion",
  "fecha_de_firma",
  "fecha",
];

async function probe(id: string, label: string): Promise<Probe> {
  const sample = new URL(`${RESOURCE_BASE}/${id}.json`);
  sample.searchParams.set("$limit", "1");

  let response: Response;
  try {
    response = await fetch(sample, { headers: { Accept: "application/json" } });
  } catch (error) {
    return { id, label, reachable: false, note: `请求失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) {
    return { id, label, reachable: false, note: `${response.status} ${response.statusText}` };
  }

  const rows = (await response.json()) as Record<string, unknown>[];
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  const result: Probe = { id, label, reachable: true, columns };

  // Total rows. count(1) over a 9M-row dataset is answered server-side in
  // one request — the alternative (paging until empty) would be minutes.
  try {
    const countUrl = new URL(`${RESOURCE_BASE}/${id}.json`);
    countUrl.searchParams.set("$select", "count(1)");
    const countResponse = await fetch(countUrl, { headers: { Accept: "application/json" } });
    if (countResponse.ok) {
      const countRows = (await countResponse.json()) as Record<string, string>[];
      const raw = countRows[0] ? Object.values(countRows[0])[0] : undefined;
      if (raw !== undefined) result.totalRows = Number(raw);
    }
  } catch {
    // Count is a nice-to-have; the reachability verdict above is what matters.
  }

  // Recent rows — the archive-vs-feed test. Tries each plausible date
  // column and keeps the first the server accepts, rather than assuming
  // every dataset names its publication date the way SECOP II does.
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceLiteral = since.toISOString().slice(0, 19);
  for (const column of DATE_COLUMN_CANDIDATES) {
    if (columns.length > 0 && !columns.includes(column)) continue;
    try {
      const recentUrl = new URL(`${RESOURCE_BASE}/${id}.json`);
      recentUrl.searchParams.set("$select", "count(1)");
      recentUrl.searchParams.set("$where", `${column} >= '${sinceLiteral}'`);
      const recentResponse = await fetch(recentUrl, { headers: { Accept: "application/json" } });
      if (!recentResponse.ok) continue;
      const recentRows = (await recentResponse.json()) as Record<string, string>[];
      const raw = recentRows[0] ? Object.values(recentRows[0])[0] : undefined;
      if (raw !== undefined) {
        result.recentRows = Number(raw);
        result.recentColumn = column;
        break;
      }
    } catch {
      continue;
    }
  }

  return result;
}

function report(probes: Probe[]): void {
  for (const p of probes) {
    console.log(`\n── ${p.label}`);
    console.log(`   id: ${p.id}   ${RESOURCE_BASE}/${p.id}.json`);
    if (!p.reachable) {
      console.log(`   ❌ 取不到：${p.note}`);
      continue;
    }
    console.log(
      `   ✅ 可取` +
        (p.totalRows !== undefined ? `，总行数 ${p.totalRows.toLocaleString()}` : "") +
        (p.recentRows !== undefined ? `，近 90 天 ${p.recentRows.toLocaleString()} 行（按 ${p.recentColumn}）` : "，近 90 天无法统计（没找到可用的日期字段）"),
    );
    if (p.recentRows === 0) {
      console.log(`   ⚠️  近 90 天一行都没有 —— 这是存档，不是在更新的数据源，做连接器没意义。`);
    }
    if (p.columns && p.columns.length > 0) {
      console.log(`   字段 ${p.columns.length} 个${SHOW_COLUMNS ? "：" : "（加 --columns 看全部）"}`);
      if (SHOW_COLUMNS) {
        for (let i = 0; i < p.columns.length; i += 4) console.log(`     ${p.columns.slice(i, i + 4).join(", ")}`);
      }
    }
  }
}

async function main() {
  const queries = QUERIES.length > 0 ? QUERIES : DEFAULT_QUERIES;

  console.log(`先做对照组（本站已经在用的两个数据集，它们要是也取不到，那就是网络问题，本次全部结论作废）：`);
  report(await Promise.all(KNOWN_GOOD.map((k) => probe(k.id, k.label))));

  const seen = new Set(KNOWN_GOOD.map((k) => k.id));
  for (const query of queries) {
    console.log(`\n\n════ 目录搜索：「${query}」 ════`);
    let hits: CatalogHit[];
    try {
      hits = await searchCatalog(query);
    } catch (error) {
      console.log(`  目录查不了：${error instanceof Error ? error.message : error}`);
      continue;
    }
    const fresh = hits.filter((h) => !seen.has(h.id));
    for (const h of fresh) seen.add(h.id);
    if (fresh.length === 0) {
      console.log(`  没有新的数据集（命中的都已经看过了）。`);
      continue;
    }
    for (const hit of fresh) console.log(`  · ${hit.name}\n      ${hit.description}`);
    report(await Promise.all(fresh.map((h) => probe(h.id, h.name))));
  }

  console.log(
    `\n\n读法：总行数大、近 90 天也大 → 值得做连接器；总行数大但近 90 天为 0 → 存档；` +
      `字段里没有“过程名称/发标单位/截止日期”这三样 → 映射不成标书，行数再多也没用。`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
