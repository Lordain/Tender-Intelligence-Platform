/**
 * The cron Bearer gate. Tested because it is the only thing standing between
 * the open internet and three routes that email real customers and delete
 * rows — and because the property that matters most here (no secret means no
 * access) is exactly the one a refactor silently inverts.
 */
import type { NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "../lib/security/cron-auth";

let ran = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  ran += 1;
  if (actual !== expected) failures.push(`${name}：期望 ${String(expected)}，实际 ${String(actual)}`);
}

/** Only `headers.get("authorization")` is read, so this is the whole surface. */
function requestWith(authorization: string | null): NextRequest {
  return { headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? authorization : null) } } as unknown as NextRequest;
}

const ORIGINAL = process.env.CRON_SECRET;

process.env.CRON_SECRET = "s3cret-value";
check("正确的 Bearer 通过", isAuthorizedCronRequest(requestWith("Bearer s3cret-value")), true);
check("错误的密钥拒绝", isAuthorizedCronRequest(requestWith("Bearer wrong-value")), false);
check("缺少 Authorization 头拒绝", isAuthorizedCronRequest(requestWith(null)), false);
check("空 Authorization 头拒绝", isAuthorizedCronRequest(requestWith("")), false);
check("少了 Bearer 前缀拒绝", isAuthorizedCronRequest(requestWith("s3cret-value")), false);
check("前缀大小写不同拒绝", isAuthorizedCronRequest(requestWith("bearer s3cret-value")), false);
// A correct prefix must not pass. This is the shape a byte-at-a-time attack
// produces, and it is also what a naive startsWith() refactor would let in.
check("正确前缀但不完整拒绝", isAuthorizedCronRequest(requestWith("Bearer s3cret-val")), false);
check("正确密钥加后缀拒绝", isAuthorizedCronRequest(requestWith("Bearer s3cret-value-extra")), false);
check("多余空格拒绝", isAuthorizedCronRequest(requestWith("Bearer  s3cret-value")), false);

// Fails closed. An unset secret must mean "nobody", never "everybody" — the
// failure mode of getting this backwards is silent and total.
delete process.env.CRON_SECRET;
check("未配置密钥时拒绝正确格式的请求", isAuthorizedCronRequest(requestWith("Bearer s3cret-value")), false);
check("未配置密钥时拒绝空 Bearer", isAuthorizedCronRequest(requestWith("Bearer ")), false);
check("未配置密钥时拒绝无头请求", isAuthorizedCronRequest(requestWith(null)), false);

process.env.CRON_SECRET = "";
check("密钥为空字符串时拒绝", isAuthorizedCronRequest(requestWith("Bearer ")), false);

if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = ORIGINAL;

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  定时任务鉴权（常量时间比较、无密钥时全部拒绝），全部 ${ran} 项通过`);
