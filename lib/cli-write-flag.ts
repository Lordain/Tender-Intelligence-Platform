/**
 * `--write` as npm actually delivers it.
 *
 * Every destructive maintenance script in scripts/ defaults to a dry run and
 * commits only when passed `--write`. npm needs `--` to pass a flag through
 * to the script:
 *
 *     npm run reclassify:tenders -- --write     ✅ the script sees --write
 *     npm run reclassify:tenders --write        ❌ npm eats it
 *
 * The second form does not fail. npm prints one grey warning line —
 * `npm warn Unknown cli config "--write"` — and then runs the script with an
 * EMPTY argv, so the script does a dry run and says so. Read quickly, the
 * output looks like a successful write followed by a stale-sounding footer.
 * That happened for real on 2026-09-18: a reclassify that should have moved
 * 21 tiers and deleted 6 rows was run twice, believed both times, and
 * changed nothing.
 *
 * The recovery is that npm does leave a trace. An unknown `--foo` still
 * becomes `npm_config_foo=true` in the child's environment (verified against
 * the npm in this repo, not assumed), so the mistake is detectable with
 * certainty from inside the script.
 *
 * What this does NOT do is treat that as consent. These scripts delete rows;
 * quietly promoting a misparsed flag into a real write would trade a visible
 * no-op for a silent deletion, which is the worse of the two failures. So it
 * stops, prints the command that works, and exits non-zero.
 */

/** Set when the flag reached the script properly (`-- --write`) — the only form that authorises a write. */
export function hasWriteFlag(argv: string[] = process.argv): boolean {
  if (argv.includes("--write")) return true;

  // npm swallowed it. Nothing has run yet, so refusing here costs one retyped
  // command; guessing here could cost a table.
  if (process.env.npm_config_write !== undefined) {
    const script = process.env.npm_lifecycle_event;
    console.error("\n看到 --write 了，但它没传进来 —— npm 把它当成自己的参数吃掉了（上面那行 npm warn 就是）。");
    console.error("要写库得加两个横杠：\n");
    console.error(`  npm run ${script ?? "<script>"} -- --write\n`);
    console.error("这次什么都没做。数据库原样不动。");
    process.exit(1);
  }

  return false;
}
