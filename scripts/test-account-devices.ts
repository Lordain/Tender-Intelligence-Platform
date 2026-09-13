/**
 * Which browser gets signed out when an account exceeds its device cap.
 *
 * The rule this pins is the one that keeps the cap from hurting a paying
 * customer: the device making the request has just refreshed its
 * last_seen_at, so it is always the newest and never the one evicted. Get
 * that ordering backwards and every fourth sign-in kicks out the person who
 * just signed in — a loop they cannot escape.
 *
 * Pure over (rows, limit); no database.
 *
 * Usage: npm run test:account-devices
 */
import { describeDevice, devicesToRevoke, MAX_ACTIVE_DEVICES } from "../lib/account-devices";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
  }
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

// ── Under and at the cap nothing is touched ────────────────────────────────
check("an empty account revokes nothing", devicesToRevoke([]), []);
check(
  "three devices are exactly the cap",
  devicesToRevoke([
    { device_id: "a", last_seen_at: at(0) },
    { device_id: "b", last_seen_at: at(60) },
    { device_id: "c", last_seen_at: at(120) },
  ]),
  [],
);

// ── The fourth evicts the stalest, never the caller ────────────────────────
check(
  "a fourth device evicts the least recently seen",
  devicesToRevoke([
    { device_id: "new", last_seen_at: at(0) },
    { device_id: "b", last_seen_at: at(60) },
    { device_id: "c", last_seen_at: at(120) },
    { device_id: "stale", last_seen_at: at(9999) },
  ]),
  ["stale"],
);
check(
  "the order rows arrive in does not decide who goes",
  devicesToRevoke([
    { device_id: "stale", last_seen_at: at(9999) },
    { device_id: "c", last_seen_at: at(120) },
    { device_id: "new", last_seen_at: at(0) },
    { device_id: "b", last_seen_at: at(60) },
  ]),
  ["stale"],
);
check(
  "several over the cap go oldest first",
  devicesToRevoke([
    { device_id: "new", last_seen_at: at(0) },
    { device_id: "b", last_seen_at: at(10) },
    { device_id: "c", last_seen_at: at(20) },
    { device_id: "d", last_seen_at: at(30) },
    { device_id: "e", last_seen_at: at(40) },
  ]),
  ["d", "e"],
);

// A page can fire several requests at once, so two rows can share a stamp.
// Which of the tied rows goes is arbitrary and does not matter; that the
// same one goes every time does — an unstable pick would evict a different
// device on each retry of the same request. Ties sort by ascending id, so
// the last id among equals is the one past the cap.
check(
  "a tie is broken the same way every time",
  devicesToRevoke([
    { device_id: "new", last_seen_at: at(0) },
    { device_id: "zzz", last_seen_at: at(60) },
    { device_id: "aaa", last_seen_at: at(60) },
    { device_id: "mmm", last_seen_at: at(60) },
  ]),
  ["zzz"],
);
check(
  "and does not depend on the order the rows arrived in",
  devicesToRevoke([
    { device_id: "aaa", last_seen_at: at(60) },
    { device_id: "mmm", last_seen_at: at(60) },
    { device_id: "new", last_seen_at: at(0) },
    { device_id: "zzz", last_seen_at: at(60) },
  ]),
  ["zzz"],
);

check("the cap ships at 3", MAX_ACTIVE_DEVICES, 3);

// ── User-Agent labels ──────────────────────────────────────────────────────
// Edge and Opera both carry "Chrome", and Chrome carries "Safari"; telling
// an Edge user they are on Chrome makes the list useless for the one thing
// it is for — recognising which row is the machine you want gone.
check("Edge is not reported as Chrome", describeDevice(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0",
), "Windows · Edge");
check("Chrome is not reported as Safari", describeDevice(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
), "Mac · Chrome");
check("real Safari is still Safari", describeDevice(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
), "iOS · Safari");
check("WeChat's in-app browser is named", describeDevice(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.40",
), "iOS · 微信");
check("an empty User-Agent is not guessed at", describeDevice(""), "未知设备");
check("a missing User-Agent is not guessed at", describeDevice(null), "未知设备");

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
