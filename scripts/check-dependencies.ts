/**
 * Every bare module the source imports must be declared in package.json.
 *
 * Exists because of a real failure (2026-09-07): `csv-parse` was removed as
 * an unused dependency, but four ingestion connectors import it. tsc, eslint
 * and `next build` all passed — every one of them asks only "does this
 * resolve?", and it still resolved from a node_modules directory that had
 * kept the package after it left package.json. The break only surfaced on
 * the next machine to run a clean install, which was the user's, mid-import.
 *
 * This asks the different question: is it DECLARED. Node builtins and the
 * project's own "@/" and relative paths are skipped; a subpath import
 * (csv-parse/sync, @anthropic-ai/sdk/helpers/zod) is checked against its
 * package root.
 *
 * Usage: npm run check:deps
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, extname } from "node:path";

const ROOTS = ["app", "components", "lib", "scripts", "types", "data"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

/**
 * Anchored at the start of a line so prose inside a comment cannot match —
 * a first attempt at this check without the anchor reported "seguimiento"
 * and "unknown currency" as missing packages, because those words appear
 * after the word `from` in Spanish and Chinese comments.
 */
const PATTERNS = [
  /^\s*import\s+[^;'"]*?from\s+['"]([^'"]+)['"]/,
  /^\s*import\s+['"]([^'"]+)['"]/,
  /^\s*export\s+[^;'"]*?from\s+['"]([^'"]+)['"]/,
  /^\s*(?:const|let|var)\s+.*?=\s*require\(['"]([^'"]+)['"]\)/,
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && !entry.startsWith(".")) yield* sourceFiles(path);
    } else if (EXTENSIONS.has(extname(entry))) {
      yield path;
    }
  }
}

function packageRoot(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
const builtins = new Set(builtinModules);

const usedBy = new Map<string, Set<string>>();
for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      for (const pattern of PATTERNS) {
        const specifier = line.match(pattern)?.[1];
        if (!specifier) continue;
        if (specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("node:")) continue;
        const name = packageRoot(specifier);
        if (builtins.has(name)) continue;
        (usedBy.get(name) ?? usedBy.set(name, new Set()).get(name)!).add(file);
      }
    }
  }
}

const missing = [...usedBy.entries()].filter(([name]) => !declared.has(name)).sort();
const used = new Set(usedBy.keys());
// Reported, never failed on: a dependency can legitimately have no import —
// a CLI, a type-only package, a peer another package needs.
const unused = [...declared].filter((name) => !used.has(name)).sort();

console.log(`已声明 ${declared.size} 个依赖，源码引用 ${used.size} 个外部包。\n`);
if (unused.length > 0) {
  console.log(`没有被 import 的依赖（可能正常：CLI、类型包、peer 依赖）：\n  ${unused.join("\n  ")}\n`);
}
if (missing.length === 0) {
  console.log("✅ 所有被 import 的包都在 package.json 里。");
  process.exit(0);
}
console.error(`❌ ${missing.length} 个包被 import 但没有声明——干净安装后会构建失败：\n`);
for (const [name, files] of missing) {
  console.error(`  ${name}`);
  for (const file of [...files].sort()) console.error(`      ${file}`);
}
process.exit(1);
