/**
 * The CKAN envelope, pinned.
 *
 * lib/ingestion/connectors/ckan.ts exists so a Brazilian open-data mapper is
 * written against real column names rather than recalled ones. It has one
 * behaviour that is worth a test rather than a careful reading, because
 * getting it wrong is silent:
 *
 *   **A FAILED CKAN call can arrive as HTTP 200 with `success: false`.**
 *   A client that reads `body.result` without checking `success` reports a
 *   server-side error as an empty result set — and an empty result set from a
 *   real portal reads like "this dataset does not exist", which is the wrong
 *   conclusion and the kind that stops an investigation.
 *
 * The rest of the assertions guard the two envelopes not getting conflated
 * (`package_search` counts, `datastore_search` totals) and the query string
 * not carrying empty parameters, which some CKAN installs reject.
 *
 * No network. `fetch` is stubbed, so this runs anywhere — including this
 * sandbox, where every .gov.br host is blocked.
 */
import { ckanAction, ckanDatastoreSearch, ckanPackageSearch, ckanStatus } from "@/lib/ingestion/connectors/ckan";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

const realFetch = globalThis.fetch;
let lastUrl = "";

/** Answers the next call with exactly this body, and records the URL that asked for it. */
function stub(body: string, status = 200) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function thrown(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(没有抛错)";
  } catch (err) {
    return (err as Error).message;
  }
}

const BASE = "https://example.test";

async function main() {

  console.log("success=false 不能被当成空结果");
  stub(JSON.stringify({ success: false, error: { __type: "Validation Error", message: "resource_id not found" } }));
  const failMessage = await thrown(() => ckanAction(BASE, "datastore_search", { resource_id: "nope" }));
  check("HTTP 200 + success:false 会抛错", /success=false/.test(failMessage), true);
  check("错误正文带上了 CKAN 自己的说法", /resource_id not found/.test(failMessage), true);

  console.log("\n两个信封不能混为一谈");
  stub(JSON.stringify({ success: true, result: { count: 41, results: [{ name: "leiloes-de-transmissao", title: "Leilões de Transmissão", resources: [{ id: "abc", format: "CSV", datastore_active: true }] }] } }));
  const search = await ckanPackageSearch(BASE, { q: "leilão transmissão", rows: 5 });
  check("package_search 读 count", search.count, 41);
  check("package_search 读 results", search.results.length, 1);
  check("资源里的 datastore_active 保留下来了", search.results[0]?.resources?.[0]?.datastore_active, true);

  stub(JSON.stringify({ success: true, result: { total: 12, fields: [{ id: "NomLeilao", type: "text" }, { id: "VlrRAP", type: "numeric" }], records: [{ NomLeilao: "Leilão 01/2026", VlrRAP: 123.45 }] } }));
  const data = await ckanDatastoreSearch(BASE, { resourceId: "abc", limit: 3 });
  check("datastore_search 读 total（不是 count）", data.total, 12);
  check("字段名原样带出", data.fields.map((f) => f.id), ["NomLeilao", "VlrRAP"]);
  check("行原样带出", data.records[0]?.NomLeilao, "Leilão 01/2026");

  console.log("\n查询串");
  check("resource_id 用的是下划线写法，limit 跟着走", /resource_id=abc/.test(lastUrl) && /limit=3/.test(lastUrl), true);
  stub(JSON.stringify({ success: true, result: { count: 0, results: [] } }));
  await ckanPackageSearch(BASE, { q: undefined, rows: 5 });
  check("空参数不会以 q= 的形式发出去", /[?&]q=/.test(lastUrl), false);
  check("带重音的关键词被正确编码", (await (async () => { stub(JSON.stringify({ success: true, result: { count: 0, results: [] } })); await ckanPackageSearch(BASE, { q: "transmissão" }); return lastUrl; })()).includes("transmiss%C3%A3o"), true);

  console.log("\n不是 CKAN 的主机，要说清楚是哪一种不对");
  stub("<!DOCTYPE html><html><body>Página não encontrada</body></html>");
  check("200 + HTML 说的是「不是 JSON」，不是解析崩了", /not JSON/.test(await thrown(() => ckanStatus(BASE))), true);
  stub("upstream is down", 502);
  check("HTTP 502 带上状态码", /HTTP 502/.test(await thrown(() => ckanStatus(BASE))), true);

  console.log("\nstatus_show 的字段换名");
  stub(JSON.stringify({ success: true, result: { ckan_version: "2.9.5", site_title: "Dados Abertos ANEEL", extensions: ["datastore"] } }));
  const status = await ckanStatus(BASE);
  check("ckan_version → ckanVersion", status.ckanVersion, "2.9.5");
  check("site_title → siteTitle", status.siteTitle, "Dados Abertos ANEEL");
  check("extensions 原样", status.extensions, ["datastore"]);
  // A portal that answers status_show without a version is still CKAN; null is
  // the honest value and must not become the string "undefined" in a report.
  stub(JSON.stringify({ success: true, result: {} }));
  check("缺字段是 null，不是 undefined 字符串", (await ckanStatus(BASE)).ckanVersion, null);

  globalThis.fetch = realFetch;
}

// The tally has to run AFTER main resolves, not alongside it — top-level
// await is unavailable here, and a summary printed while the checks are still
// running reports every suite as passing.
main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} 项没通过。`);
      process.exit(1);
    }
    console.log("\n全部通过。");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
