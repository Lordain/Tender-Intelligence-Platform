/**
 * The Chile probe's pure parts, against payloads really captured on
 * 2026-09-24 (see lib/ingestion/README.md's 2026-09-24 section).
 *
 * There is nothing here about Chilean tender data, because no Chilean tender
 * data was received — every request was refused by this container's egress
 * gateway before a socket to Chile was opened. What CAN be tested is the
 * thing that round actually produced, and it is worth more than it sounds:
 *
 *  1. that a locally-manufactured 403 is never read as a refusal from the
 *     source, which is the mistake the whole round was nearly written up as;
 *  2. that a report whose peer controls were all denied does NOT tell its
 *     reader the Chilean rows can be read as data — the first version did
 *     exactly that, and it is pinned here so it cannot come back;
 *  3. that the JSON describer reports FIELD NAMES, since a mapper is written
 *     from field names and the Brazil probe once reported a CKAN envelope as
 *     if it were a finding.
 *
 * Fixtures under lib/ingestion/__fixtures__/chile/ are the gateway's own
 * bytes, unedited. The OCDS sample is this repo's existing real Peru capture,
 * used here only to exercise the describer on a genuine payload.
 *
 * Usage: npm run test:chile-doors
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describeEgressDenial, egressDenial } from "@/lib/ingestion/egress-denial";
import { describeJson, renderChileReport, type DoorResult } from "@/lib/ingestion/chile-doors";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`}`);
}

const FIXTURES = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");
const read = (file: string) => readFileSync(path.join(FIXTURES, file), "utf-8");

// ── 1. The gateway's refusal, verbatim ────────────────────────────────────
console.log("出口拦截的识别（真实抓到的网关应答）");

const MERCADO = read("c1-egress_denied.txt");
const PERU = read("c0c-egress_denied.txt");
const DENY_HEADERS = new Headers({ "content-type": "text/plain", "x-deny-reason": "host_not_allowed" });

check("认出被拦的是哪个域名", egressDenial(DENY_HEADERS, MERCADO)?.host, "api.mercadopublico.cl");
check("认出网关给的原因码", egressDenial(DENY_HEADERS, MERCADO)?.reason, "host_not_allowed");
// The same gateway refuses a source this platform imports from in
// production. That is the fact that makes the Chilean rows uninformative,
// so it is pinned rather than left as prose in a report.
check("生产环境在用的秘鲁源也被同一个网关拦掉", egressDenial(DENY_HEADERS, PERU)?.host, "contratacionesabiertas.oece.gob.pe");
// Header stripped: the body alone still has to be enough, because a proxy in
// front of this one may not pass response headers through.
check("响应头被剥掉时，光靠正文也要认出来", egressDenial(new Headers(), MERCADO) !== null, true);
check("说明文字必须点明「不是对方拒绝的」", describeEgressDenial({ host: "api.mercadopublico.cl", reason: "host_not_allowed" }).includes("不是对方拒绝的"), true);

// The negative case, and the one that decides whether this helper is safe to
// put in front of a real connector. This body is the REAL 403 Peru's edge
// proxy served on 2026-09-11 (quoted in README.md's Peru section, template
// placeholder left unexpanded and all) — a genuine refusal from the source.
// If it matched here, the helper would start telling a reader that a real
// WAF block is a local setting, which is the same collapse in the other
// direction and would waste a day.
const REAL_PERU_403 = '{"code":"403","message":"Forbidden","RequestId":"${http.request.id}"}';
check("对方真的拒绝时，不能误判成本机出口问题", egressDenial(new Headers({ "content-type": "application/json" }), REAL_PERU_403), null);
check("普通 HTML 拦截页也不算出口问题", egressDenial(new Headers(), "<html><title>Access Denied</title></html>"), null);

// ── 2. The report must not overstate what a denied round measured ─────────
console.log("\n报告的结论（这一条是回归测试：第一版的结论是错的）");

const door = (id: string, confidence: DoorResult["confidence"], verdict: DoorResult["verdict"]): DoorResult => ({
  id,
  what: id,
  url: `https://example.invalid/${id}`,
  confidence,
  verdict,
  detail: "",
  ms: 1,
  status: verdict === "egress_denied" ? 403 : 200,
});

// Exactly the shape of the real 2026-09-24 run: the plain reachability
// control answers, both production-source controls are denied, and every
// Chilean door is denied.
const DENIED_ROUND: DoorResult[] = [
  door("C0", "control", "answered"),
  door("C0b", "control", "egress_denied"),
  door("C0c", "control", "egress_denied"),
  door("C1", "documented-elsewhere", "egress_denied"),
  door("C3", "documented-elsewhere", "egress_denied"),
];
const deniedReport = renderChileReport(DENIED_ROUND, "测试机");

// The exact sentence the first version printed, off the back of C0 alone.
// GitHub answering says the process has a socket and nothing more.
check("不能因为 C0 通了就说结果可以当数据读", deniedReport.includes("可以当数据读"), false);
check("必须先声明这一轮不成立", deniedReport.includes("这一轮不成立"), true);
check("必须说清楚生产环境的源也够不着", deniedReport.includes("巴西 PNCP 和秘鲁 OECE"), true);
check("必须明确劝阻去写连接器", deniedReport.includes("不要写连接器"), true);
// "You have no network" and "you may only reach a few domains" need opposite
// fixes, and the report has to say which one it saw.
check("要区分「没网」和「只允许少数域名」", deniedReport.includes("只允许去少数几个域名"), true);

// The other branch: peer controls open, so a Chilean failure really is
// Chile's. The report must then stop hedging and say so.
const REAL_ROUND: DoorResult[] = [
  door("C0", "control", "answered"),
  door("C0b", "control", "answered"),
  door("C0c", "control", "answered"),
  door("C1", "documented-elsewhere", "credential_required"),
  door("C3", "documented-elsewhere", "answered"),
];
const realReport = renderChileReport(REAL_ROUND, "测试机");
check("对照通了以后，才允许说结果可以当数据读", realReport.includes("可以当数据读"), true);
check("对照通了以后，不再说这一轮不成立", realReport.includes("这一轮不成立"), false);
check("通了的门要被点名", realReport.includes("智利这边通了 1 个：C3"), true);
// A credential wall is a finding to report, never something to route around.
check("要凭证的门要单独说明", realReport.includes("不绕、不伪装浏览器、不自己去注册"), true);

// A door skipped for want of a ticket must not be counted as Chile refusing
// us — it is a decision the platform owner has not made yet.
const skipped = door("C1c", "documented-elsewhere", "credential_required");
check("没配 ticket 的门不算「通」", renderChileReport([door("C0", "control", "answered"), door("C0b", "control", "answered"), door("C0c", "control", "answered"), skipped], "测试机").includes("智利这边一个都没通"), true);

// ── 3. The describer reports field names ──────────────────────────────────
console.log("\nJSON 描述（映射器是从字段名写出来的，不是从状态码）");

// The real describeJson, not a copy of it. A second implementation written
// for the test would pass while the shipped one drifted — the "one code path"
// rule in README.md applies to a probe's describer exactly as it does to a
// connector.
//
// Not a Chilean payload and not pretending to be: this repo's existing real
// OCDS capture, used to prove the describer unwraps an envelope and names
// FIELDS rather than printing the envelope's own keys.
const OCDS = readFileSync(path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "sample-ocds-release.json"), "utf-8");
const described = describeJson(OCDS);
console.log(`     （真实 OCDS 样本读出来是：${described.slice(0, 150)}）`);
check("真实 OCDS 样本要报出字段名，而不是只报外层信封", /ocid|id|tender|date|buyer/i.test(described), true);

// An empty list is an ANSWER — "nothing published in this window" — and must
// never be reported as a failure. This is the empty ≠ unreachable half of the
// house rule, in the one place the probe could get it wrong.
check("空列表要说成「这个窗口没有数据」，不是失败", describeJson('{"Cantidad":0,"Listado":[]}').includes("不是失败"), true);
// A CKAN call can FAIL at HTTP 200 with success:false. Reading `result`
// without checking `success` is how a client reports an error as no results.
check("CKAN 200 但 success=false 不能读成空结果", describeJson('{"success":false,"error":{"message":"Not found"}}').includes("success=false"), true);
check("CKAN status_show 要报出版本号（ckan.ts 能否直接复用就看这个）", describeJson('{"success":true,"result":{"ckan_version":"2.9.5","site_title":"Datos"}}').includes("CKAN 2.9.5"), true);

if (failures > 0) {
  console.log(`\n${failures} 项没过。`);
  process.exit(1);
}
console.log("\n全部通过。");
