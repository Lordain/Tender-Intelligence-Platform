/**
 * Saves ANTAQ's SisapInternet hearing pages as bytes — the eleven hearings the
 * gov.br parser cannot read because they are not gov.br pages.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * The "audiências públicas em andamento" page lists 20 hearings across three
 * hosts. `www.gov.br` holds 6 and the parser was written for those.
 * `leilao.antaq.gov.br` holds 3 behind a Cloudflare challenge measured shut
 * from the laptop, from Vercel and from the runner alike — nothing to capture.
 * `sisapinternet.antaq.gov.br` holds the other 11, and it is a different
 * application entirely: ASP.NET WebForms, `audienciapublicaconsultar.aspx?
 * Audiencia=NNN`. It has never been fetched from any machine, so nobody knows
 * whether it answers, and no parser exists for it.
 *
 * So the FIRST job of this script is not to capture anything. It is to answer
 * whether that host answers at all, and to say which kind of "no" it gets —
 * a Cloudflare challenge, a timeout, a 404 and a parse-worthy page are four
 * different situations with four different next steps, and a run that reports
 * "failed" for all of them tells the operator nothing.
 *
 * ── Why only the recent ones ──────────────────────────────────────────────
 *
 * The user's rule for this source, verbatim: 招标中就保留，以逾期就不要. Of the
 * eleven, only three are 2025 or later (05/2026, 01/2026, 06/2025); the rest
 * are 2024 and 2022 and any window drops them. The window is the same one
 * `scripts/ingest-antaq.ts` applies and for the same reason — the year on the
 * hearing's own number, never a page's publication date, because ANTAQ
 * re-stamps those. lib/ingestion/antaq-window.ts carries the measurements.
 *
 * `--years 0` captures all eleven, for the day someone wants a second page
 * shape to write the parser against.
 *
 * ── What is stripped before committing ────────────────────────────────────
 *
 * `__VIEWSTATE`, `__VIEWSTATEGENERATOR` and `__EVENTVALIDATION`: ASP.NET
 * WebForms serialises the entire server-side control tree into base64 hidden
 * inputs, routinely hundreds of KB of it. They are opaque, per-request, and
 * useless to a parser — committing them would bury the 10KB that matters
 * under state nobody can read and that changes on every fetch, making every
 * re-capture a large meaningless diff.
 *
 * Read-only. No Supabase, no writes to anything but `exports/` and the
 * fixtures directory.
 *
 * Usage (on the runner — this host has never been reachable from anywhere
 * else, including the sandbox this was written in):
 *   Actions → Probe Brazil doors → what=capture-sisap
 *   npm run capture:antaq-sisap -- --years 0
 */
import { mkdir, writeFile } from "node:fs/promises";
import { collectLinks } from "@/lib/ingestion/brazil-behind-doors";

const INDEX = "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas";
const SISAP_HOST = "sisapinternet.antaq.gov.br";
const OUT_DIR = "exports/antaq-sisap";
const FIXTURE_DIR = "lib/ingestion/__fixtures__/antaq-sisap";
const TIMEOUT_MS = 45_000;
const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** gov.br answers the laptop and the runner; a 403 here is usually the agent sandbox's allowlist, not ANTAQ. */
const SANDBOX_HINT =
  "这是「够不着」，不是「没有听证」。gov.br 对笔记本和 GitHub 跑批机都开着；\n" +
  "受限沙箱里 .gov.br 本来就不在出口白名单里，换台机器跑即可。";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

type Fetched = { html: string } | { failure: string; kind: "challenge" | "refused" | "network" | "http" };

/**
 * Names which kind of "no" this was.
 *
 * Distinguished because the next step differs: a challenge means the host is
 * up and screening us (nothing a header will fix — this repo has measured
 * that twice on ANEEL and on leilao.antaq), a network error means try another
 * machine, and an HTTP status means the URL or the app changed.
 */
async function get(url: string): Promise<Fetched> {
  let response: Response;
  try {
    response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { failure: `连不上：${message}`, kind: "network" };
  }
  if (response.status === 403 || response.status === 503) {
    const body = await response.text().catch(() => "");
    const challenged = /cloudflare|cf-browser-verification|just a moment|challenge-platform/i.test(body);
    return challenged
      ? { failure: `${response.status} —— Cloudflare 验证页，主机是活的，但它不让我们进（换 header 没用，这个仓库在 ANEEL 和 leilao.antaq 上各试过一次）`, kind: "challenge" }
      : { failure: `${response.status} ${response.statusText}`, kind: "refused" };
  }
  if (!response.ok) return { failure: `${response.status} ${response.statusText}`, kind: "http" };
  return { html: await response.text() };
}

/** `Audiência Pública n° 05/2026` → 2026. The year on the number, which nothing re-stamps. */
function yearOf(title: string): number | undefined {
  const match = /(\d{1,3})\s*\/\s*(\d{4})/.exec(title);
  return match === null ? undefined : Number(match[2]);
}

/** `…?Audiencia=640` → `640`. The id is the only stable part of these URLs. */
function audienciaId(url: string): string {
  return new URL(url).searchParams.get("Audiencia") ?? "unknown";
}

/**
 * Drops the WebForms state and the scripts, keeps everything a parser reads.
 *
 * Deliberately NOT cut to a content region the way the gov.br capture is: that
 * one could name `<main>` because five real pages had been seen first. Nothing
 * here has been seen, so guessing at a container risks trimming away the very
 * table the parser needs and leaving no trace that it happened. Size is
 * controlled by removing what is provably noise, and the note says exactly
 * what was removed.
 */
function trimForFixture(html: string, url: string): string {
  const stripped = html
    .replace(/<input[^>]*name="__(?:VIEWSTATE|VIEWSTATEGENERATOR|EVENTVALIDATION|VIEWSTATEENCRYPTED)"[^>]*>/gi, (m) => {
      const name = /name="(__[A-Z]+)"/i.exec(m)?.[1] ?? "__VIEWSTATE";
      return `<input type="hidden" name="${name}" id="${name}" value="[已删除：ASP.NET 的控件树状态，几百 KB 的 base64，解析器用不上]" />`;
    })
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const note = [
    "<!--",
    "  ANTAQ SisapInternet 听证页（ASP.NET WebForms，不是 gov.br 的 Plone）。",
    "  已删除：__VIEWSTATE / __VIEWSTATEGENERATOR / __EVENTVALIDATION 的值、<script>、<style>。",
    "  正文一律没动 —— 这套页面谁都没见过，按猜出来的容器裁反而可能把要解析的表裁掉。",
    `  原页 ${Math.round(html.length / 1024)}KB，这里 ${Math.round(stripped.length / 1024)}KB。`,
    `  来源：${url}`,
    `  抓取：${new Date().toISOString().slice(0, 10)}（npm run capture:antaq-sisap，在 GitHub Actions 跑批机上）`,
    "  重抓：Actions → Probe Brazil doors → what=capture-sisap",
    "-->",
  ].join("\n");
  return `${note}\n${stripped}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const yearsRaw = argValue(args, "--years");
  const years = yearsRaw === undefined ? 2 : Number(yearsRaw);
  if (!Number.isFinite(years) || years < 0 || !Number.isInteger(years)) {
    console.error(`--years 认不出来："${yearsRaw}"。给 0 或更大的整数，0 表示全抓。`);
    process.exit(1);
  }
  const cutoffYear = years <= 0 ? undefined : new Date().getUTCFullYear() - (years - 1);

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(FIXTURE_DIR, { recursive: true });

  // The route is followed, not composed — the same rule the gov.br capture
  // follows. `/audiencias-em-andamento` is the obvious guess and it 404s, and
  // a 404 there reads as "there are no live hearings".
  const index = await get(INDEX);
  if ("failure" in index) throw new Error(`索引页取不到 —— ${index.failure}\n  ${INDEX}\n${SANDBOX_HINT}`);
  const live = collectLinks(index.html, INDEX).find((l) => /em\s+andamento/i.test(l.text));
  if (live === undefined) throw new Error("索引页上没有「em andamento」那条链接 —— 页面结构变了");

  const liveHtml = await get(live.href);
  if ("failure" in liveHtml) throw new Error(`「进行中」那一页取不到 —— ${liveHtml.failure}\n  ${live.href}\n${SANDBOX_HINT}`);

  const listed = collectLinks(liveHtml.html, live.href).filter(
    (l) => l.host === SISAP_HOST && /audi[êe]ncia\s+p[úu]blica\s+n/i.test(l.text),
  );
  const seen = new Set<string>();
  const unique = listed.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));

  console.log(`「进行中」列出 ${SISAP_HOST} 上的听证 ${unique.length} 场。`);
  const wanted: typeof unique = [];
  for (const link of unique) {
    const year = yearOf(link.text);
    const keep = cutoffYear === undefined || (year !== undefined && year >= cutoffYear);
    if (keep) wanted.push(link);
    else console.log(`  跳过 ${link.text.slice(0, 44).padEnd(44)} —— 场次号是 ${year ?? "?"} 年的，${cutoffYear} 年以前的不要`);
  }
  console.log(`要抓 ${wanted.length} 场${cutoffYear === undefined ? "（未设窗口）" : `（${cutoffYear} 年及以后）`}。\n`);

  let reachable = 0;
  const failures: { title: string; kind: string; why: string }[] = [];
  for (const [i, link] of wanted.entries()) {
    const id = audienciaId(link.href);
    const result = await get(link.href);
    if ("failure" in result) {
      failures.push({ title: link.text.trim(), kind: result.kind, why: result.failure });
      console.log(`  ✗ ${link.text.slice(0, 44).padEnd(44)} —— ${result.failure}`);
      continue;
    }
    reachable += 1;
    const name = `${String(i + 1).padStart(2, "0")}-audiencia-${id}.html`;
    await writeFile(`${OUT_DIR}/${name}`, result.html);
    const trimmed = trimForFixture(result.html, link.href);
    await writeFile(`${FIXTURE_DIR}/${name}`, trimmed);
    console.log(`  ✓ ${link.text.slice(0, 44).padEnd(44)} → ${name}  原 ${Math.round(result.html.length / 1024)}KB → 样本 ${Math.round(trimmed.length / 1024)}KB`);
  }

  console.log(`\n── ${reachable} / ${wanted.length} 抓到了 ──`);
  if (reachable === 0) {
    // The whole point of the run. An unreachable host and an empty source need
    // opposite fixes, and the kind of refusal says which one.
    const kinds = new Set(failures.map((f) => f.kind));
    console.log(`${SISAP_HOST} 一场都没抓到。这是「够不着」，不是「没有听证」——`);
    if (kinds.has("challenge")) console.log("  它返的是验证页：主机活着，但它在挡我们。换 header 没用，这条路和 leilao.antaq 一样要算关着。");
    if (kinds.has("network")) console.log("  网络层就没通：换台机器再试（这个仓库里三张网互不相同，见 probe-brazil-doors.yml 的抬头）。");
    if (kinds.has("http") || kinds.has("refused")) console.log("  HTTP 状态码不对：链接或这套应用变了，先人工打开一条看看。");
    process.exitCode = 1;
    return;
  }
  console.log(`样本写在 ${FIXTURE_DIR}/，workflow 会提交回分支；完整原页在 ${OUT_DIR}/，作为 artifact。`);
  console.log("下一步是照着这些样本写解析器 —— 这个仓库的规矩：解析器照真实抓取写，不照着对它的描述写。");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
