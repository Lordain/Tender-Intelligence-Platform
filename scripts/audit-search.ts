/**
 * Put the tender search through the queries people actually type, and
 * measure what it misses.
 *
 * User, 2026-10-10: 我用你写的关键词搜索都搜不到 / 你能不能做个模型，反复测试
 * 我们的搜索功能，看有没有需要优化的地方. The two searches that failed were
 * "AMBA I 电力输送" (stored title: “AMBA I”公共工程特许经营电力输送系统扩建工程)
 * and "波哥大 BRT 智能交通系统" (stored: …BRT线路车站…及ITS配套设备…). Both words
 * of each query are in the title — but filterTenders() matches the whole query
 * as ONE contiguous substring, so two words separated by a space never match
 * unless they sit side by side in the text. The second also asks for 智能交通
 * where the title only says ITS.
 *
 * How it tests: for each round it samples tenders and, from each one's own
 * text, builds queries of a few kinds a person would type (below). The tender
 * the words came from is the right answer, so a query that does not find it is
 * a miss. Every query runs through:
 *   - 现在   — filterTenders(), exactly as /tenders runs it today;
 *   - 改进后 — a candidate matcher kept in this file only: the query is split
 *              on spaces and every word must appear (in any order); accents,
 *              full-width characters and punctuation are folded away.
 * Both look at the same fields (tenderSearchText), in the member ("full") and
 * guest ("public") scopes, so the candidate never searches text a viewer
 * cannot see. It also reports where a found tender lands in the default
 * 推荐 order (page 1 = the first 20), and how many results each query returns,
 * so a looser matcher that floods the list shows up too.
 *
 * Finally a small zh ↔ es/pt term list counts tenders that one wording misses
 * because the text uses another (智能交通 vs ITS, 光伏 vs fotovoltaica …).
 *
 * Read-only; nothing is written. Without Supabase it runs on the bundled
 * sample tenders, which is only enough to check the script itself.
 *
 *   npm run audit:search
 *   npm run audit:search -- --rounds 5 --sample 400 --seed 7
 */
import { fetchAllTendersFromDb } from "../lib/db/tenders";
import { tenders as sampleTenders } from "../data/tenders";
import { filterTenders, sortTenders, tenderSearchText } from "../lib/filter-tenders";
import type { Tender } from "../types/tender";

/** /tenders shows 20 rows a page (lib/tender-list-page.ts TENDER_PAGE_SIZE). */
const PAGE_SIZE = 20;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const ROUNDS = arg("rounds", 3);
const SAMPLE = arg("sample", 300);
const SEED = arg("seed", 20261010);

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the candidate matcher ------------------------------------------------

const fold = (text: string) => text.normalize("NFKC").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const spaced = (text: string) => ` ${fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const compact = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, "");

type Haystack = { raw: string; spaced: string; compact: string };
const haystackCache = new Map<string, Haystack>();
function haystackOf(tender: Tender, scope: "full" | "public"): Haystack {
  const key = `${scope}|${tender.slug}`;
  let hay = haystackCache.get(key);
  if (!hay) {
    const raw = tenderSearchText(tender, scope);
    hay = { raw, spaced: spaced(raw), compact: compact(raw) };
    haystackCache.set(key, hay);
  }
  return hay;
}

/**
 * Today's rule, the check filterTenders() makes on an already-visible row:
 * the whole query, lowercased, as one substring. Cached here because the
 * test asks it millions of times; main() checks it against filterTenders()
 * itself before trusting it.
 */
const currentMatches = (tender: Tender, query: string, scope: "full" | "public") => haystackOf(tender, scope).raw.includes(query.trim().toLowerCase());

/** Whole-word for source-language terms, so "metro" does not count "metros" (metres). */
function termAppears(tender: Tender, term: string): boolean {
  const hay = haystackOf(tender, "full");
  const word = spaced(term);
  return /\p{Script=Han}/u.test(term) ? hay.spaced.includes(word.trim()) : hay.spaced.includes(word);
}

/** A word matches when it appears in the folded text, or — for codes like LPN-001/2026 — once separators are dropped on both sides. */
function wordMatches(hay: Haystack, word: string): boolean {
  const asText = spaced(word).trim();
  const asCode = compact(word);
  return (asText !== "" && hay.spaced.includes(asText)) || (asCode !== "" && hay.compact.includes(asCode));
}

function candidateMatches(tender: Tender, query: string, scope: "full" | "public", synonyms: boolean): boolean {
  const hay = haystackOf(tender, scope);
  const words = query.split(/\s+/).filter(Boolean);
  return words.every((word) => {
    if (wordMatches(hay, word)) return true;
    if (!synonyms) return false;
    const group = SYNONYM_GROUPS.find((terms) => terms.some((term) => compact(term) === compact(word)));
    return group ? group.some((term) => wordMatches(hay, term)) : false;
  });
}

// ---- zh ↔ es/pt wording ---------------------------------------------------

/** Each line: ways of saying the same thing. Chinese first, then source-language terms. Kept short and unambiguous on purpose. */
const SYNONYM_GROUPS: string[][] = [
  ["智能交通", "ITS", "sistema inteligente de transporte", "sistemas inteligentes de transporte"],
  ["快速公交", "BRT", "TransMilenio"],
  ["地铁", "metro", "metrô", "subterráneo"],
  // Not bare "solar": in Spanish it is also a plot of land.
  ["光伏", "太阳能", "fotovoltaica", "fotovoltaico", "energía solar", "energia solar"],
  ["风电", "风力发电", "eólica", "eólico"],
  ["输电", "输变电", "transmisión eléctrica", "linha de transmissão", "transmissão"],
  ["变电站", "subestación", "subestação"],
  ["储能", "almacenamiento de energía", "armazenamento de energia", "BESS"],
  ["污水", "aguas residuales", "esgoto", "alcantarillado"],
  ["饮用水", "供水", "agua potable", "abastecimento de água"],
  ["公路", "carretera", "rodovia"],
  ["桥梁", "puente", "ponte"],
  // Not "porto": Porto Alegre, Porto Velho.
  ["港口", "puerto", "portuário", "portuaria"],
  ["机场", "aeropuerto", "aeroporto"],
  ["铁路", "ferrocarril", "ferrovia", "ferroviário"],
  ["医院", "hospital"],
  ["电动公交", "电动巴士", "buses eléctricos", "bus eléctrico", "ônibus elétrico"],
  ["数据中心", "centro de datos", "data center"],
  ["视频监控", "videovigilancia", "CCTV", "videomonitoramento"],
];

// ---- query generators -------------------------------------------------------

type Kind = { id: string; label: string; scopes: ("full" | "public")[]; make: (tender: Tender, random: () => number) => string | null };

const HAN_RUN = /\p{Script=Han}{2,}/gu;
const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9-]{1,}/g;
const ACCENTED = /[áéíóúâêôãõçñüàè]/i;
const STOPWORDS = new Set(["para", "por", "con", "del", "los", "las", "una", "uno", "que", "com", "dos", "das", "nos", "nas", "the", "and", "de", "la", "el", "en", "y", "e", "o", "a"]);

const pick = <T,>(items: T[], random: () => number): T | null => (items.length === 0 ? null : items[Math.floor(random() * items.length)]);
const hasChinese = (text: string) => /\p{Script=Han}/u.test(text);
/** The Chinese title a viewer reads: the condensed one when there is one. */
const chineseTitle = (tender: Tender, scope: "full" | "public") => {
  const title = scope === "public" ? tender.titleZhPublic || tender.title.zh : tender.titleZhShort || tender.title.zh;
  return hasChinese(title) ? title : "";
};
function hanSlice(run: string, length: number, random: () => number): string {
  const chars = [...run];
  if (chars.length <= length) return run;
  const start = Math.floor(random() * (chars.length - length + 1));
  return chars.slice(start, start + length).join("");
}
const sourceWords = (tender: Tender) =>
  (tender.title.es.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 5 && !STOPWORDS.has(word.toLowerCase()));

function kinds(scope: "full" | "public"): Kind[] {
  const all: Kind[] = [
    {
      id: "zh-phrase",
      label: "中文标题里连续的一段（4–6 字）",
      scopes: ["full", "public"],
      make: (tender, random) => {
        const run = pick([...chineseTitle(tender, scope).matchAll(HAN_RUN)].map((m) => m[0]).filter((r) => [...r].length >= 4), random);
        return run ? hanSlice(run, 4 + Math.floor(random() * 3), random) : null;
      },
    },
    {
      id: "zh-two-words",
      label: "中文标题里不相邻的两个词，空格隔开",
      scopes: ["full", "public"],
      make: (tender, random) => {
        const runs = [...chineseTitle(tender, scope).matchAll(HAN_RUN)].map((m) => m[0]);
        if (runs.length >= 2) {
          const first = Math.floor(random() * runs.length);
          let second = Math.floor(random() * (runs.length - 1));
          if (second >= first) second += 1;
          return `${hanSlice(runs[first], 2 + Math.floor(random() * 3), random)} ${hanSlice(runs[second], 2 + Math.floor(random() * 3), random)}`;
        }
        const chars = [...(runs[0] ?? "")];
        if (chars.length < 10) return null;
        const half = Math.floor(chars.length / 2);
        return `${hanSlice(chars.slice(0, half - 1).join(""), 3, random)} ${hanSlice(chars.slice(half + 1).join(""), 3, random)}`;
      },
    },
    {
      id: "zh-mixed",
      label: "中文标题里的英文缩写 + 一个中文词（如 AMBA 电力）",
      scopes: ["full", "public"],
      make: (tender, random) => {
        const title = chineseTitle(tender, scope);
        const latin = pick(title.match(LATIN_TOKEN) ?? [], random);
        const run = pick([...title.matchAll(HAN_RUN)].map((m) => m[0]), random);
        return latin && run ? `${latin} ${hanSlice(run, 2 + Math.floor(random() * 3), random)}` : null;
      },
    },
    {
      id: "place-no-accent",
      label: "带重音的地名/外文词，不打重音（Pindare / Bogota）",
      scopes: ["full", "public"],
      make: (tender, random) => {
        const words = (chineseTitle(tender, scope).match(/[\p{Script=Latin}]{4,}/gu) ?? []).filter((word) => ACCENTED.test(word));
        const word = pick(words, random);
        return word ? fold(word) : null;
      },
    },
    {
      id: "source-no-accent",
      label: "原文标题里带重音的词，不打重音（licitacion / construcao）",
      scopes: ["full"],
      make: (tender, random) => {
        const word = pick(sourceWords(tender).filter((w) => ACCENTED.test(w)), random);
        return word ? fold(word) : null;
      },
    },
    {
      id: "source-two-words",
      label: "原文标题里不相邻的两个词，空格隔开",
      scopes: ["full"],
      make: (tender, random) => {
        const words = sourceWords(tender);
        if (words.length < 3) return null;
        const first = Math.floor(random() * (words.length - 2));
        const second = first + 2 + Math.floor(random() * (words.length - first - 2));
        return `${words[first]} ${words[second]}`;
      },
    },
    {
      id: "number-no-separators",
      label: "招标编号去掉 - / . 等分隔符",
      scopes: ["full"],
      make: (tender) => {
        const number = tender.tenderNumber.trim();
        return /[-/._ ]/.test(number) && compact(number).length >= 6 ? compact(number) : null;
      },
    },
  ];
  return all.filter((kind) => kind.scopes.includes(scope));
}

// ---- running ----------------------------------------------------------------

type Tally = { tried: number; now: number; candidate: number; nowPage1: number; nowResults: number[]; candidateResults: number[]; misses: { query: string; title: string }[] };

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const pct = (part: number, whole: number) => (whole === 0 ? "  -" : `${Math.round((part / whole) * 100)}%`.padStart(4));

async function loadTenders(): Promise<{ tenders: Tender[]; fromDb: boolean }> {
  const fromDb = await fetchAllTendersFromDb();
  return fromDb ? { tenders: fromDb, fromDb: true } : { tenders: sampleTenders, fromDb: false };
}

async function main() {
  const { tenders: all, fromDb } = await loadTenders();
  const visible = filterTenders(all, {});
  const now = Date.now();
  const ordered = sortTenders(visible, "recommended", now);
  const position = new Map(ordered.map((tender, index) => [tender.slug, index]));
  console.log(`${fromDb ? "数据库" : "内置示例数据（没有配置 Supabase，只用来检查脚本本身）"}：共 ${visible.length} 条可见项目。`);
  console.log(`每轮抽 ${Math.min(SAMPLE, visible.length)} 条，跑 ${ROUNDS} 轮（种子 ${SEED}）。「找到」= 搜出了提供这些词的那条项目。\n`);

  let checked = 0;
  for (const scope of ["full", "public"] as const) {
    const tallies = new Map<string, Tally>();
    const scopeKinds = kinds(scope);
    for (let round = 0; round < ROUNDS; round++) {
      const random = rng(SEED + round * 7919 + (scope === "public" ? 1 : 0));
      const sample = [...visible].sort(() => random() - 0.5).slice(0, SAMPLE);
      for (const tender of sample) {
        for (const kind of scopeKinds) {
          const query = kind.make(tender, random);
          if (!query) continue;
          const tally = tallies.get(kind.id) ?? { tried: 0, now: 0, candidate: 0, nowPage1: 0, nowResults: [], candidateResults: [], misses: [] };
          tallies.set(kind.id, tally);
          tally.tried += 1;
          const nowHits = visible.filter((item) => currentMatches(item, query, scope));
          if (checked < 40) {
            checked += 1;
            const reference = filterTenders(visible, { query, searchPublicFieldsOnly: scope === "public" });
            if (reference.length !== nowHits.length) throw new Error(`「现在」的复刻和 filterTenders 结果不同：${query}`);
          }
          tally.nowResults.push(nowHits.length);
          if (nowHits.some((hit) => hit.slug === tender.slug)) {
            tally.now += 1;
            // Rank among the hits in the 推荐 order /tenders uses by default.
            const rank = nowHits.filter((hit) => (position.get(hit.slug) ?? 0) < (position.get(tender.slug) ?? 0)).length;
            if (rank < PAGE_SIZE) tally.nowPage1 += 1;
          } else if (tally.misses.length < 4) {
            tally.misses.push({ query, title: chineseTitle(tender, scope) || tender.title.es });
          }
          const candidateHits = visible.filter((item) => candidateMatches(item, query, scope, false));
          tally.candidateResults.push(candidateHits.length);
          if (candidateHits.some((hit) => hit.slug === tender.slug)) tally.candidate += 1;
        }
      }
    }

    console.log(`==== ${scope === "full" ? "会员视角（中文 + 原文 + 采购单位 + 编号）" : "游客视角（只搜公开中文）"} ====`);
    console.log("   次数  现在 改进后 现在在第一页 结果条数中位(现在/改进后)  查询方式");
    for (const kind of scopeKinds) {
      const tally = tallies.get(kind.id);
      if (!tally) continue;
      const results = `${median(tally.nowResults)} / ${median(tally.candidateResults)}`;
      console.log(
        `  ${String(tally.tried).padStart(5)}  ${pct(tally.now, tally.tried)}  ${pct(tally.candidate, tally.tried)}        ${pct(tally.nowPage1, tally.now)}  ${results.padStart(22)}    ${kind.label}`,
      );
    }
    console.log("\n  现在搜不到的例子：");
    for (const kind of scopeKinds) {
      const tally = tallies.get(kind.id);
      if (!tally || tally.misses.length === 0) continue;
      console.log(`  【${kind.label}】`);
      for (const miss of tally.misses) console.log(`    搜「${miss.query}」  →  ${miss.title.replace(/\s+/g, " ").slice(0, 60)}`);
    }
    console.log("");
  }

  console.log("==== 同一件事的不同说法（会员视角）：只用一种说法搜，会漏掉多少 ====");
  console.log("  这个主题共有 N 条项目（任一说法出现在标题、摘要、采购单位里）；用某个说法搜，现在能找到几条。");
  for (const group of SYNONYM_GROUPS) {
    const about = visible.filter((tender) => group.some((term) => termAppears(tender, term)));
    if (about.length === 0) continue;
    const found = group.map((term) => `${term} ${about.filter((tender) => currentMatches(tender, term, "full")).length}`);
    console.log(`  共 ${String(about.length).padStart(3)} 条 | ${found.join(" · ")}`);
  }

  console.log("\n只读，没有写入任何数据。把上面的输出整段发我。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
