/**
 * Filing a downloaded document against the right tender when two tenders
 * share a 招标编号.
 *
 * The real case (2026-09-18): two Colombian projects both numbered
 * LP-006-2026 — a tourism/works project in Samacá, Boyacá and another in
 * Ayapel, Córdoba. A Colombian `referencia_del_proceso` is issued per
 * entity, so this is normal and permanent, not data corruption. The
 * analysis of one was written onto the other's page.
 *
 * Worth pinning because every failure here is silent. A misfiled analysis
 * looks exactly like a correct one: the batch reports "written", the tender
 * page fills with requirements and risks, and the only way to notice is to
 * read the Spanish and realise it describes a different municipality.
 *
 * All pure — no Supabase, no PDF, no network.
 *
 * Usage: npm run test:document-matching
 */
import { chooseAmongCandidates, describeAmbiguity, indexKnownTenders, matchNumberInMangledFileName, squashSeparators, toWordHaystack, type KnownTender } from "../lib/ingestion/match-documents-to-tenders";

type Check = { label: string; pass: boolean; detail?: string };
const checks: Check[] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push({ label, pass, detail });

// The reported pair. Buyer names and the shared number are the real ones;
// the NITs inside the slugs are stand-ins, since the report showed the
// titles rather than the slugs.
const SAMACA: KnownTender = {
  slug: "secop-800100000-lp-006-2026",
  title: "博亚卡（Boyacá）省萨马卡（Samacá）市旅游基础设施",
  buyer: "MUNICIPIO DE SAMACÁ",
  tier: "standard",
  publicationDate: "2026-09-14",
};
const AYAPEL: KnownTender = {
  slug: "secop-800200000-lp-006-2026",
  title: "科尔多瓦省（Córdoba）阿亚佩尔（Ayapel）市政工程",
  buyer: "MUNICIPIO DE AYAPEL",
  tier: "standard",
  publicationDate: "2026-09-07",
};

// --- indexKnownTenders: nothing may be dropped -------------------------
// This is the defect itself. The old loader was a Map<string, KnownTender>,
// so the second row with a given number replaced the first and only one of
// the two ever reached the matcher — decided by Supabase's row order, which
// is unspecified without an ORDER BY.
const index = indexKnownTenders([
  { slug: SAMACA.slug, tender_number: "LP-006-2026", title: { zh: SAMACA.title }, buyer: SAMACA.buyer, relevance_tier: "standard", publication_date: "2026-09-14" },
  { slug: AYAPEL.slug, tender_number: "LP-006-2026", title: { zh: AYAPEL.title }, buyer: AYAPEL.buyer, relevance_tier: "standard", publication_date: "2026-09-07" },
  { slug: "secop-800300000-lp-007-2026", tender_number: "lp-007-2026", title: { zh: "另一个项目" }, buyer: "MUNICIPIO DE TUNJA", relevance_tier: "standard", publication_date: "2026-09-10" },
  { slug: "manual-no-number", tender_number: "   ", title: { zh: "没有编号" }, buyer: "X", relevance_tier: null, publication_date: null },
]);

check("同编号的两个项目都留下了（旧代码只留一个）", index.get("LP-006-2026")?.length === 2, `实际 ${index.get("LP-006-2026")?.length ?? 0} 条`);
check("留下的是两个不同 slug，不是同一条两次", new Set(index.get("LP-006-2026")?.map((t) => t.slug)).size === 2);
check("编号按大写归一，小写写法也能查到", index.get("LP-007-2026")?.length === 1);
check("只有空白的编号不占位", !index.has("") && !index.has("   "));
check("发布日期跟着带出来（歧义报告要用它区分新旧）", index.get("LP-006-2026")?.[0].publicationDate === "2026-09-14");

// --- chooseAmongCandidates: the document decides, or nobody does --------
const samacaPliego = "PLIEGO DE CONDICIONES. MUNICIPIO DE SAMACA - BOYACA. LICITACION PUBLICA No. LP-006-2026. OBJETO: MEJORAMIENTO DE LA INFRAESTRUCTURA TURISTICA.";
const ayapelPliego = "PLIEGO DE CONDICIONES. ALCALDIA DE AYAPEL, CORDOBA. LICITACION PUBLICA LP-006-2026.";

const forSamaca = chooseAmongCandidates([SAMACA, AYAPEL], samacaPliego);
check(
  "文件里写的是 SAMACA，就归 Samacá 那条",
  "tender" in forSamaca && forSamaca.tender.slug === SAMACA.slug,
  "tender" in forSamaca ? `选中 ${forSamaca.tender.slug}，依据 ${forSamaca.evidence.join("/")}` : "判为歧义",
);
// The record writes SAMACÁ and the PDF writes SAMACA. A comparison that
// needs both spellings to agree would abstain on a document it could read.
check("重音不影响匹配（库里 SAMACÁ，文件里 SAMACA）", "tender" in forSamaca && forSamaca.evidence.includes("SAMACA"));

const forAyapel = chooseAmongCandidates([SAMACA, AYAPEL], ayapelPliego);
check("反过来也成立，文件里写 AYAPEL 就归 Ayapel 那条", "tender" in forAyapel && forAyapel.tender.slug === AYAPEL.slug);

// The whole point: no evidence means no answer, NOT the first/newest row.
check(
  "两个都没提到时判为歧义（不猜、不选最新的那条）",
  "ambiguous" in chooseAmongCandidates([SAMACA, AYAPEL], "PLIEGO DE CONDICIONES. LICITACION PUBLICA LP-006-2026. CONDICIONES GENERALES."),
);
check(
  "两个都提到时也判为歧义（比分再高也不算答案）",
  "ambiguous" in chooseAmongCandidates([SAMACA, AYAPEL], "CONVENIO INTERADMINISTRATIVO ENTRE EL MUNICIPIO DE SAMACA Y EL MUNICIPIO DE AYAPEL. LP-006-2026."),
);
// MUNICIPIO and the connecting words are in both names, so they can only
// ever produce a tie. Scoring on the full buyer name instead of the
// distinguishing part is how a reliable signal becomes a coin flip.
check(
  "两个单位名共有的词（MUNICIPIO）不算证据",
  "ambiguous" in chooseAmongCandidates([SAMACA, AYAPEL], "PLIEGO DEL MUNICIPIO. LICITACION PUBLICA LP-006-2026."),
);

// Only one candidate: unchanged from before this fix, and the overwhelming
// majority of real documents.
const single = chooseAmongCandidates([SAMACA], "cualquier texto");
check("只有一个候选时直接返回它，不需要任何证据", "tender" in single && single.tender.slug === SAMACA.slug && single.evidence.length === 0);

// A known and accepted limit, pinned so it is a decision rather than a
// surprise: entity acronyms shorter than 4 characters are not used as
// evidence, so a pair told apart only by one abstains and asks for a
// rename. Short tokens matching loose text is the worse failure.
check(
  "只靠 3 个字母的单位简称区分时，宁可判歧义也不猜",
  "ambiguous" in
    chooseAmongCandidates(
      [
        { ...SAMACA, buyer: "CVC" },
        { ...AYAPEL, buyer: "CAR" },
      ],
      "PLIEGO DE LA CVC. LP-006-2026.",
    ),
);

// --- toWordHaystack ----------------------------------------------------
check("整词匹配：SAMACA 不会命中 SAMACANDO 这种更长的词", !toWordHaystack("SAMACANDO ALGO").includes(" SAMACA "));
check("标点被当成分隔符（SAMACÁ, BOYACÁ → 两个词）", toWordHaystack("SAMACÁ, BOYACÁ").includes(" SAMACA ") && toWordHaystack("SAMACÁ, BOYACÁ").includes(" BOYACA "));

// --- a file name the operating system rewrote --------------------------
// The user's report (2026-09-20): a Brazilian tender is numbered
// 05639268000191-1-000015/2026, and Windows forbids `/` in a file name, so
// the document saves as 05639268000191-1-0000152026. The exact substring
// test cannot see the number any more, and the Compras MX-shaped regex
// fallback never could — so a correctly named Brazilian document was
// skipped with "no known tender_number found".
const PNCP = "05639268000191-1-000015/2026";
const OTHER_PNCP = "05639268000191-1-000016/2026";
const COLOMBIA = "CVC LP 008 2026";
const SHORT = "LP-006-2026";
const numbers = [PNCP, OTHER_PNCP, COLOMBIA, SHORT];

const windowsName = "05639268000191-1-0000152026.pdf";
check(
  "Windows 去掉斜杠后的文件名仍然认得出是哪个项目",
  (matchNumberInMangledFileName(windowsName, numbers) as { number: string })?.number === PNCP,
  JSON.stringify(matchNumberInMangledFileName(windowsName, numbers)),
);
check("认的是同一个项目，不是编号只差一位的隔壁项目", (matchNumberInMangledFileName(windowsName, numbers) as { number: string })?.number !== OTHER_PNCP);

// Whatever the tool substituted — browsers, ZIP utilities and operators all
// pick differently, and none of them is the stored spelling.
for (const [label, name] of [["下划线", "05639268000191-1-000015_2026.pdf"], ["连字符", "05639268000191-1-000015-2026.pdf"], ["空格", "05639268000191 1 000015 2026.pdf"], ["整串数字", "056392680001911000015 2026 edital.pdf"]] as const) {
  check(`分隔符换成${label}也认得出`, (matchNumberInMangledFileName(name, numbers) as { number: string })?.number === PNCP, name);
}

check(
  "编号前后还有别的字也认得出（真实文件名很少是光秃秃的编号）",
  (matchNumberInMangledFileName("Edital_05639268000191-1-0000152026_anexo1.pdf", numbers) as { number: string })?.number === PNCP,
);

// The 2026-09-16 Colombian miss, recovered by the same pass: the number is
// stored WITH spaces (`CVC LP 008 2026`) and the file name hyphenates it.
check(
  "带空格存储的哥伦比亚编号，连字符文件名也认得出",
  (matchNumberInMangledFileName("secop-890399002-cvc-lp-008-2026.pdf", numbers) as { number: string })?.number === COLOMBIA,
);

// The guard rails.
check(
  "太短的编号不参加这一轮（LP-006-2026 挤在一串数字里会误伤）",
  matchNumberInMangledFileName("informe-lp0062026-final.pdf", [SHORT]) === null,
);
check(
  "文件名同时命中两个不同编号时弃权，不猜",
  "ambiguous" in (matchNumberInMangledFileName("05639268000191-1-0000152026-e-05639268000191-1-0000162026.pdf", numbers) ?? {}),
);
check("完全对不上的文件名返回 null", matchNumberInMangledFileName("convocatoria-final.pdf", numbers) === null);
check("squashSeparators 只留字母数字并大写", squashSeparators("05639268000191-1-000015/2026") === "0563926800019110000152026");

// --- describeAmbiguity: the operator has to be able to act on it -------
const message = describeAmbiguity("Pliego.pdf", "LP-006-2026", [SAMACA, AYAPEL]);
check("歧义提示列出了两条项目的 slug", message.includes(SAMACA.slug) && message.includes(AYAPEL.slug));
check("歧义提示带上发布日期，看得出哪条是新的", message.includes("2026-09-14") && message.includes("2026-09-07"));
check("歧义提示写清楚了没有改动任何项目", message.includes("没有改动任何项目"));
check("歧义提示给出了唯一能解决它的操作（改名成 <slug>__）", message.includes("__Pliego.pdf"));

console.log("标书归属匹配\n");
let failures = 0;
for (const c of checks) {
  if (c.pass) console.log(`  OK    ${c.label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${c.label}${c.detail ? `\n        ${c.detail}` : ""}`);
  }
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
if (failures > 0) process.exit(1);
