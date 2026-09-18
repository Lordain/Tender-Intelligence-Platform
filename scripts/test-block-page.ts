/**
 * The three false positives, pinned.
 *
 * `probe:brazil-concessions` run two printed ★ — "browser headers got us in"
 * — for three pages that were refusals, because it judged the retry by its
 * status code and ANTT's F5 appliance answers **HTTP 200** with
 * "The requested URL was rejected". The bodies below are the real ones from
 * that run, so a future edit to the signature list cannot quietly un-detect
 * the exact pages that caused the mistake.
 *
 * The negative cases matter as much: a works tender whose text happens to
 * contain "access" or a page that merely mentions Cloudflare must not be
 * called a block page, or the probe starts hiding real answers instead of
 * fake ones.
 */
import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

// Real bodies, shortened, from the 2026-09-18 run.
const F5 = '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.<br><br>Your support ID is: 123456789<br></body></html>';
const CLOUDFLARE_403 = '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Please enable cookies.</body></html>';
const CLOUDFLARE_CHALLENGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="cf_chl_opt"></div></body></html>';
const CCEE = '<html><head><title>Acesso bloqueado</title></head><body><h2>Acesso bloqueado</h2><p>Seu acesso foi bloqueado.</p></body></html>';

console.log("真实拦截页：一个都不能漏");
check("F5 的 Request Rejected（它是 HTTP 200 —— 三个假阳性就出在这）", blockPageReason(F5) !== null, true);
check("F5 的 support ID 也认", blockPageReason("Your support ID is: 998877") !== null, true);
check("Cloudflare 403", blockPageReason(CLOUDFLARE_403) !== null, true);
check("Cloudflare 的 JS 验证页", blockPageReason(CLOUDFLARE_CHALLENGE) !== null, true);
check("CCEE 手写的 Acesso bloqueado", blockPageReason(CCEE) !== null, true);

console.log("\n正常页面：一个都不能误伤");
check("一条普通的葡语标讯正文", blockPageReason("Contratação de empresa para execução de obras de pavimentação asfáltica."), null);
check("CKAN 的 JSON 应答", blockPageReason('{"success": true, "result": {"ckan_version": "2.9.5"}}'), null);
// "acesso" on its own is an ordinary Portuguese word — a tender for road
// access works says it, and must not be read as a refusal.
check("「acesso」单独出现不算拦截", blockPageReason("Construção de via de acesso ao porto"), null);
check("空正文不算拦截（那是另一回事）", blockPageReason(""), null);

console.log("\n标题和正文");
check("读得出 <title>", pageTitle(F5), "Request Rejected");
check("没有 <title> 时给空串，不是 undefined", pageTitle("<html><body>oi</body></html>"), "");
check("正文去掉了脚本", visibleText('<html><script>var a = "隐藏文字";</script><body>可见文字</body></html>'), "可见文字");
check("正文去掉了样式", visibleText("<style>.a{color:red}</style><p>可见</p>"), "可见");
// The measurement that decided PPI: 266 characters and zero links. The point
// of visibleText is that this number is trustworthy, so tags must not inflate it.
check("标签不算进正文长度", visibleText("<div><span><b>四个字</b></span></div>").length, 3);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
