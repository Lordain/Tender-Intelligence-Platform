/**
 * The model-call deadline (lib/ingestion/model-deadline.ts).
 *
 * The real failure (2026-11-18): 「更新项目文案」 reported 「翻译」这一步超时被
 * 服务器中断 at only 18 rows. One DashScope call that did not come back was
 * awaited for the SDK's default ten minutes, with two retries, and the host
 * killed the request at 300 s. This checks the one thing the fix depends on —
 * that the SDK really gives up at the signal, retries included — against a
 * local server that accepts the request and never answers. No network, no
 * model, no cost.
 *
 * Usage: npm run test:model-deadline
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { modelDeadline } from "../lib/ingestion/model-deadline";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
}

async function main() {
  // Pure part.
  let clock = 1_000;
  const d = modelDeadline(1_000, 5_000, () => clock);
  check("截止前 passed() 为 false", !d.passed());
  clock = 6_000;
  check("到点后 passed() 为 true", d.passed());
  const none = modelDeadline(1_000, undefined);
  check("命令行（不设截止）不给信号、永不到点", none.signal() === undefined && !none.passed());

  // The SDK against a server that never answers.
  let requests = 0;
  const server = createServer(() => {
    requests += 1; // accept, never respond
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const client = new OpenAI({ apiKey: "test", baseURL: `http://127.0.0.1:${port}/v1` });

  const startedAt = Date.now();
  const deadline = modelDeadline(startedAt, 1_500);
  let error: unknown;
  try {
    await client.chat.completions.create({ model: "qwen3.7-plus", messages: [{ role: "user", content: "x" }] }, { signal: deadline.signal() });
  } catch (err) {
    error = err;
  }
  const elapsed = Date.now() - startedAt;
  check("不回应的调用在截止时间被取消（不是等 10 分钟）", error !== undefined && elapsed < 5_000, `用时 ${elapsed} ms，错误 ${String(error)}`);
  check("取消时已经到点，这一批的行会算作「留给下一轮」而不是失败", deadline.passed());
  check("取消后不再重试", requests === 1, `服务器收到 ${requests} 次请求`);

  server.closeAllConnections();
  server.close();
  console.log(failed === 0 ? `全部 ${passed} 项通过` : `${failed} 项失败`);
  if (failed > 0) process.exit(1);
}

main();
