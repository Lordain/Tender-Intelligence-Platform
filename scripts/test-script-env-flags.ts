import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every npm script whose entry file reads a credential must load .env.local.
 *
 * tsx does not read .env.local on its own, so a script registered as plain
 * `tsx scripts/x.ts` sees none of the developer's local configuration. The
 * failure is quiet and misleading: the script's own guard fires and prints
 * "DASHSCOPE_API_KEY isn't set", which reads as "your key is missing" to the
 * one person who can see that it plainly is not. Real cost, 2026-09-20 —
 * titles:public shipped without the flag and the user went looking for a
 * problem in their own .env.local.
 *
 * `--env-file-if-exists` (not --env-file) is the right flag everywhere: the
 * same scripts run on GitHub runners where .env.local does not exist and the
 * credentials arrive as real environment variables, and the strict form would
 * fail the run outright.
 */
const ROOT = join(import.meta.dirname, "..");
const ENV_FLAG = "--env-file-if-exists=.env.local";

/** A file that mentions any of these needs the developer's local configuration. */
const CREDENTIAL_MARKERS = [
  "createSupabaseAdminClient",
  "DASHSCOPE_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
];

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

let ran = 0;
const failures: string[] = [];

for (const [name, command] of Object.entries(packageJson.scripts)) {
  // Only the tsx entry points. `next dev` and friends load .env.local themselves.
  const match = /(scripts\/[\w-]+\.ts)/.exec(command);
  if (match === null || !command.startsWith("tsx")) continue;
  // This checker lists the marker strings in order to search for them, so it
  // matches itself. It reads no credential of its own.
  if (match[1] === "scripts/test-script-env-flags.ts") continue;

  let source: string;
  try {
    source = readFileSync(join(ROOT, match[1]), "utf8");
  } catch {
    failures.push(`${name}：指向的文件不存在（${match[1]}）`);
    ran += 1;
    continue;
  }

  const needsEnv = CREDENTIAL_MARKERS.filter((marker) => source.includes(marker));
  if (needsEnv.length === 0) continue;

  ran += 1;
  if (!command.includes(ENV_FLAG)) {
    failures.push(
      `${name} 读取了 ${needsEnv.join("、")}，但没有 ${ENV_FLAG}——` +
      `本地运行时会报「没有设置」，而用户的 .env.local 里其实有。`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  需要凭据的 npm 脚本都会加载 .env.local，共 ${ran} 个`);
