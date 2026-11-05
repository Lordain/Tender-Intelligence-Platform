/**
 * The platform's own Supabase egress count (lib/ops/supabase-egress.ts,
 * 2026-11-03). Offline: a local server stands in for Supabase, so the real
 * supabase-js client runs through countingFetch exactly as the app's do.
 */
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import {
  assessEgress,
  billingCycleStart,
  countingFetch,
  flushSupabaseEgress,
  formatEgressBytes,
  pendingSupabaseEgress,
} from "../lib/ops/supabase-egress";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

async function main() {
  console.log("计费周期（每月 4 日起）");
  check("11 月 3 日属于 10 月 4 日起的周期", billingCycleStart(new Date("2026-11-03T12:00:00Z")), "2026-10-04");
  check("11 月 4 日开始新周期", billingCycleStart(new Date("2026-11-04T00:30:00Z")), "2026-11-04");
  check("1 月 2 日属于上一年 12 月 4 日起的周期", billingCycleStart(new Date("2027-01-02T00:00:00Z")), "2026-12-04");

  console.log("提醒门槛");
  const now = new Date("2026-11-20T01:40:00Z");
  const rows = [
    { day: "2026-11-02", bytes: 9_000_000_000 }, // the previous cycle: not counted
    { day: "2026-11-05", bytes: 1_500_000_000 },
    { day: "2026-11-19", bytes: 1_600_000_000 },
  ];
  const usage = assessEgress(rows, now);
  check("只算本周期", usage.cycleBytes, 3_100_000_000);
  check("62% → 60% 档", usage.cycleLevel, 0.6);
  check("昨天 1.6 GB → 超过一天 300 MB", [usage.lastDay, usage.dailyOver], ["2026-11-19", true]);
  const quiet = assessEgress([{ day: "2026-11-19", bytes: 40_000_000 }], now);
  check("一天 40 MB → 不提醒", [quiet.cycleLevel, quiet.dailyOver], [null, false]);
  check("超过 5 GB → 100% 档", assessEgress([{ day: "2026-11-10", bytes: 5_200_000_000 }], now).cycleLevel, 1);
  check("显示", [formatEgressBytes(3_100_000_000), formatEgressBytes(45_600_000)], ["3.10 GB", "46 MB"]);

  console.log("真实 supabase-js 客户端经过 countingFetch");
  const rowsJson = JSON.stringify([{ id: 1, title: "Licitación" }, { id: 2, title: "Pregão" }]);
  // A list page as Supabase sends it: repetitive JSON, gzipped on the wire, no Content-Length.
  const bigRows = Array.from({ length: 400 }, (_, i) => ({ id: i, title: { es: `Licitación pública ${i}`, zh: `公开招标 ${i}` }, country: "Mexico", status: "open" }));
  const bigJson = JSON.stringify(bigRows);
  const bigGzip = gzipSync(Buffer.from(bigJson));
  // Every add_supabase_egress call the counter makes; it flushes on the next tick, so two awaited queries are two calls.
  const rpcCalls: { p_bytes: number; p_requests: number }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.url?.startsWith("/rest/v1/rpc/add_supabase_egress")) {
        rpcCalls.push(JSON.parse(body));
        res.writeHead(204).end();
        return;
      }
      if (req.url?.startsWith("/rest/v1/gzipped")) {
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
        res.write(bigGzip.subarray(0, 100));
        res.end(bigGzip.subarray(100));
        return;
      }
      if (req.url?.startsWith("/rest/v1/chunked")) {
        // No Content-Length: counted as it streams through.
        res.writeHead(200, { "content-type": "application/json" });
        res.write(rowsJson.slice(0, 10));
        res.end(rowsJson.slice(10));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(rowsJson) });
      res.end(rowsJson);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  try {
    const client = createClient(url, "test-service-key", { auth: { persistSession: false }, global: { fetch: countingFetch() } });
    const sized = await client.from("tenders").select("id, title");
    check("有 Content-Length：数据照常返回", sized.data, JSON.parse(rowsJson));
    const chunked = await client.from("chunked").select("id, title");
    check("分块传输：数据照常返回", chunked.data, JSON.parse(rowsJson));
    await flushSupabaseEgress();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const total = rpcCalls.reduce((sum, call) => ({ bytes: sum.bytes + call.p_bytes, requests: sum.requests + call.p_requests }), { bytes: 0, requests: 0 });
    check("两次请求都记上了：字节数（分块的按实际流过的字节）", total.bytes, Buffer.byteLength(rowsJson) * 2);
    check("两次请求都记上了：请求数", total.requests, 2);
    check("写入记账的请求本身不经过计数", rpcCalls.length <= 2, true);
    check("写入后清空，写入本身不计数", pendingSupabaseEgress(), []);

    console.log("压缩传输（Supabase 实际的发送方式）");
    rpcCalls.length = 0;
    const gz = await client.from("gzipped").select("*");
    check("压缩传输：数据照常返回", (gz.data ?? []).length, 400);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushSupabaseEgress();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const gzCounted = rpcCalls.reduce((sum, call) => sum + call.p_bytes, 0);
    console.log(`    解压后 ${Buffer.byteLength(bigJson)} 字节，线上 ${bigGzip.byteLength} 字节，记账 ${gzCounted} 字节`);
    check("按压缩后的大小记账（与实际线上字节相差 20% 以内）", Math.abs(gzCounted - bigGzip.byteLength) / bigGzip.byteLength < 0.2, true);
    check("远小于解压后的大小（不再多算）", gzCounted < Buffer.byteLength(bigJson) / 3, true);

    const before = pendingSupabaseEgress().length;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    await client.from("tenders").select("id");
    await flushSupabaseEgress();
    check("没有服务密钥：只是不记，不出错", [before, pendingSupabaseEgress().length], [0, 0]);
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
