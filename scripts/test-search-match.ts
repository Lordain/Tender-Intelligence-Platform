/**
 * lib/search-match.ts — how a typed keyword matches a tender's text.
 *
 *   npm run test:search-match
 */
import { compileSearchQuery, foldSearchText } from "../lib/search-match";
import { filterTenders } from "../lib/filter-tenders";
import type { Tender } from "../types/tender";

let failed = 0;
let passed = 0;
function expect(name: string, query: string, text: string, want: boolean) {
  const matches = compileSearchQuery(query);
  const got = matches === null ? true : matches(foldSearchText(text));
  if (got === want) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}: 「${query}」 → ${got}, want ${want}`);
  }
}

const AMBA = "“AMBA I”公共工程特许经营电力输送系统扩建工程 Ampliación del sistema de transporte eléctrico AMBA I";
const BOGOTA = "波哥大首都特区大众运输系统BRT线路车站双扇及四扇自动滑动门及ITS配套设备供应、安装与维护 Bogotá D.C.";
const SUBSTATION = "瓦哈卡州变电站供货与安装项目 Suministro e Instalación de Subestación Oaxaca LO-018TOQ001-E123-2026";

// The two searches that failed on 2026-10-10.
expect("words apart", "AMBA I 电力输送", AMBA, true);
expect("words apart + ITS synonym", "波哥大 BRT 智能交通", BOGOTA, true);

// Whole-substring searches still work exactly as before.
expect("one Chinese phrase", "电力输送系统", AMBA, true);
expect("one source word", "Ampliación", AMBA, true);
expect("case", "amba", AMBA, true);
expect("absent word", "光纤", AMBA, false);
expect("every word must appear", "AMBA 光纤", AMBA, false);
expect("blank query = no filter", "   ", AMBA, true);

// Folding.
expect("no accent", "bogota", BOGOTA, true);
expect("no accent, source", "instalacion subestacion", SUBSTATION, true);
expect("accent typed, text without", "Óaxaca", SUBSTATION, true);
expect("full-width", "ＡＭＢＡ", AMBA, true);
expect("punctuation in query", "（AMBA I）", AMBA, true);
expect("order does not matter", "安装 瓦哈卡", SUBSTATION, true);
expect("comma separated", "瓦哈卡，变电站", SUBSTATION, true);

// Codes with or without separators.
expect("number without dashes", "lo018toq001e1232026", SUBSTATION, true);
expect("number with spaces", "LO 018TOQ001 E123 2026", SUBSTATION, true);
expect("number partial", "E123-2026", SUBSTATION, true);

// Synonyms: both directions, Chinese and Latin.
expect("光伏 finds 太阳能", "光伏", "智利太阳能电站", true);
expect("太阳能 finds 光伏", "太阳能", "秘鲁光伏电站", true);
expect("供水 finds 饮用水", "供水", "饮用水管网扩建", true);
expect("输变电 finds 输电", "输变电", "输电线路", true);
expect("ITS finds 智能交通", "ITS", "城市智能交通系统", true);
expect("BRT finds 快速公交", "BRT", "快速公交车站", true);
// A Latin synonym the viewer did not type stands alone: 智能交通 must not find "kits".
expect("synonym ITS not inside kits", "智能交通", "kits escolares 学校套件", false);
expect("synonym ITS next to Chinese", "智能交通", "ITS配套设备", true);
// …but a word the viewer typed is still a plain substring, as before.
expect("typed word is a substring", "kit", "kits escolares", true);

// Scope is unchanged: a guest's search still sees only the public Chinese copy,
// however loose the matching — an original-language word finds nothing.
const tender = {
  slug: "argentina-amba-i",
  country: "Argentina",
  status: "open",
  scopeType: "national",
  industries: ["power"],
  relevance: { tier: "flagship" },
  title: { es: "Ampliación del sistema de transporte eléctrico AMBA I", zh: "“AMBA I”公共工程特许经营电力输送系统扩建工程" },
  titleZhPublic: "阿根廷 电力输送系统扩建工程",
  summary: { es: "Licitación pública nacional e internacional", zh: "国内及国际公开招标" },
  summaryZhPublic: "阿根廷电网扩建",
  buyer: "Secretaría de Energía",
  tenderNumber: "LPNI-01/2026",
} as unknown as Tender;
const found = (query: string, guest: boolean) => filterTenders([tender], { query, searchPublicFieldsOnly: guest }).length === 1;
for (const [name, query, guest, want] of [
  ["guest, public Chinese words apart", "阿根廷 扩建", true, true],
  ["guest, source word", "ampliacion", true, false],
  ["guest, buyer", "secretaria energia", true, false],
  ["guest, tender number", "lpni012026", true, false],
  ["member, source word unaccented", "ampliacion electrico", false, true],
  ["member, tender number", "lpni012026", false, true],
] as const) {
  if (found(query, guest) === want) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}: 「${query}」 → ${!want}, want ${want}`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
