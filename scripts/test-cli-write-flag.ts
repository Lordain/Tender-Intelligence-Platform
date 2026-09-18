/**
 * The `--write` guard, which exists because a real reclassify run was lost to
 * it (2026-09-18) — see lib/cli-write-flag.ts.
 *
 * Two of the three cases can be checked in-process. The third cannot: the
 * whole point of the swallowed-flag branch is that it calls process.exit(1),
 * so asserting on it from inside this process would end the test run. It gets
 * a real child process with a real npm_config_write in its environment, which
 * is also the only way to prove the thing the helper actually depends on —
 * that npm exports an unknown `--write` under that name at all.
 *
 * Usage: npm run test:cli-write-flag
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { hasWriteFlag } from "@/lib/cli-write-flag";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

console.log("cli-write-flag\n");

// The environment this test process runs in must not itself carry the
// variable, or case 2 would pass for the wrong reason.
delete process.env.npm_config_write;

check("`-- --write` 传进来了 → true", hasWriteFlag(["node", "script.ts", "--write"]), true);
check("没传 → false（干跑）", hasWriteFlag(["node", "script.ts"]), false);

// npm ate it. A child process, because the helper exits.
const child = (() => {
  try {
    const stdout = execFileSync(process.execPath, ["-e", "process.stdout.write(String(process.env.npm_config_write))"], {
      env: { ...process.env, npm_config_write: "true" },
      encoding: "utf8",
    });
    return { exported: stdout };
  } catch (err) {
    return { exported: `子进程失败：${(err as Error).message}` };
  }
})();
check("npm 把未知的 --write 导成 npm_config_write=true", child.exported, "true");

const swallowed = (() => {
  try {
    // Through tsx, the runner every script in this repo already uses —
    // node's own --experimental-strip-types is version-gated, and a child
    // that failed to START would read here as "the guard did not fire".
    execFileSync(
      join("node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"),
      ["-e", 'import { hasWriteFlag } from "@/lib/cli-write-flag"; hasWriteFlag(["node", "s.ts"]); console.log("NO GUARD");'],
      { env: { ...process.env, npm_config_write: "true", npm_lifecycle_event: "reclassify:tenders" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { code: e.status ?? -1, stderr: e.stderr ?? "" };
  }
})();
check("npm 吃掉 --write 时退出码为 1", swallowed.code, 1);
check("报错里给出正确的命令", swallowed.stderr.includes("npm run reclassify:tenders -- --write"), true);

console.log();
if (failures > 0) {
  console.log(`${failures} 项没过。`);
  process.exit(1);
}
console.log("全部通过。");
