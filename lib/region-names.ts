/**
 * First-level administrative regions of the five countries this platform
 * ingests, paired with the Chinese name the translation prompts use.
 *
 * Exists to catch ONE specific translation failure, reported from a live page
 * (2026-09-20): 阿雷基帕省（Ancash）. Arequipa and Áncash are two different
 * Peruvian departments a thousand kilometres apart, and the row was a Huari
 * project — Huari is a province OF Áncash. The Chinese said one region and the
 * parenthetical beside it said another.
 *
 * That shape is worth hunting specifically because of what the parenthetical
 * is FOR. translate-titles-qwen.ts keeps the source spelling next to every
 * transliterated name so a subscriber can match our title against the bid
 * documents; a mismatch there does not merely read oddly, it sends someone
 * looking in the wrong region's portal — and it is invisible to every other
 * check we have, because both halves are individually well-formed Chinese and
 * well-formed Spanish.
 *
 * Only first-level regions are listed, deliberately. There are thousands of
 * municipalities and no authority to check them against, but departments and
 * states are a closed set of about a hundred, they are the names most likely
 * to be confused with one another, and being wrong about one is the error that
 * misdirects a reader furthest.
 */
export type RegionEntry = {
  /** The source-language name, as the parenthetical would carry it. */
  latin: string;
  /** The Chinese the translation prompts produce for it, without 州/省/大区. */
  zh: string;
  country: "Peru" | "Mexico" | "Colombia" | "Brazil" | "Chile";
};

export const REGION_NAMES: readonly RegionEntry[] = [
  // Peru — departamentos
  { latin: "Amazonas", zh: "亚马孙", country: "Peru" },
  { latin: "Áncash", zh: "安卡什", country: "Peru" },
  { latin: "Apurímac", zh: "阿普里马克", country: "Peru" },
  { latin: "Arequipa", zh: "阿雷基帕", country: "Peru" },
  { latin: "Ayacucho", zh: "阿亚库乔", country: "Peru" },
  { latin: "Cajamarca", zh: "卡哈马卡", country: "Peru" },
  { latin: "Callao", zh: "卡亚俄", country: "Peru" },
  { latin: "Cusco", zh: "库斯科", country: "Peru" },
  { latin: "Huancavelica", zh: "万卡维利卡", country: "Peru" },
  { latin: "Huánuco", zh: "瓦努科", country: "Peru" },
  { latin: "Ica", zh: "伊卡", country: "Peru" },
  { latin: "Junín", zh: "胡宁", country: "Peru" },
  { latin: "La Libertad", zh: "拉利伯塔德", country: "Peru" },
  { latin: "Lambayeque", zh: "兰巴耶克", country: "Peru" },
  { latin: "Lima", zh: "利马", country: "Peru" },
  { latin: "Loreto", zh: "洛雷托", country: "Peru" },
  { latin: "Madre de Dios", zh: "马德雷德迪奥斯", country: "Peru" },
  { latin: "Moquegua", zh: "莫克瓜", country: "Peru" },
  { latin: "Pasco", zh: "帕斯科", country: "Peru" },
  { latin: "Piura", zh: "皮乌拉", country: "Peru" },
  { latin: "Puno", zh: "普诺", country: "Peru" },
  { latin: "San Martín", zh: "圣马丁", country: "Peru" },
  { latin: "Tacna", zh: "塔克纳", country: "Peru" },
  { latin: "Tumbes", zh: "通贝斯", country: "Peru" },
  { latin: "Ucayali", zh: "乌卡亚利", country: "Peru" },

  // Mexico — estados
  { latin: "Aguascalientes", zh: "阿瓜斯卡连特斯", country: "Mexico" },
  { latin: "Baja California Sur", zh: "南下加利福尼亚", country: "Mexico" },
  { latin: "Baja California", zh: "下加利福尼亚", country: "Mexico" },
  { latin: "Campeche", zh: "坎佩切", country: "Mexico" },
  { latin: "Chiapas", zh: "恰帕斯", country: "Mexico" },
  { latin: "Chihuahua", zh: "奇瓦瓦", country: "Mexico" },
  { latin: "Coahuila", zh: "科阿韦拉", country: "Mexico" },
  { latin: "Colima", zh: "科利马", country: "Mexico" },
  { latin: "Durango", zh: "杜兰戈", country: "Mexico" },
  { latin: "Guanajuato", zh: "瓜纳华托", country: "Mexico" },
  { latin: "Guerrero", zh: "格雷罗", country: "Mexico" },
  { latin: "Hidalgo", zh: "伊达尔戈", country: "Mexico" },
  { latin: "Jalisco", zh: "哈利斯科", country: "Mexico" },
  { latin: "Michoacán", zh: "米却肯", country: "Mexico" },
  { latin: "Morelos", zh: "莫雷洛斯", country: "Mexico" },
  { latin: "Nayarit", zh: "纳亚里特", country: "Mexico" },
  { latin: "Nuevo León", zh: "新莱昂", country: "Mexico" },
  { latin: "Oaxaca", zh: "瓦哈卡", country: "Mexico" },
  { latin: "Puebla", zh: "普埃布拉", country: "Mexico" },
  { latin: "Querétaro", zh: "克雷塔罗", country: "Mexico" },
  { latin: "Quintana Roo", zh: "金塔纳罗奥", country: "Mexico" },
  { latin: "San Luis Potosí", zh: "圣路易斯波托西", country: "Mexico" },
  { latin: "Sinaloa", zh: "锡那罗亚", country: "Mexico" },
  { latin: "Sonora", zh: "索诺拉", country: "Mexico" },
  { latin: "Tabasco", zh: "塔巴斯科", country: "Mexico" },
  { latin: "Tamaulipas", zh: "塔毛利帕斯", country: "Mexico" },
  { latin: "Tlaxcala", zh: "特拉斯卡拉", country: "Mexico" },
  { latin: "Veracruz", zh: "韦拉克鲁斯", country: "Mexico" },
  { latin: "Yucatán", zh: "尤卡坦", country: "Mexico" },
  { latin: "Zacatecas", zh: "萨卡特卡斯", country: "Mexico" },

  // Colombia — departamentos
  { latin: "Antioquia", zh: "安蒂奥基亚", country: "Colombia" },
  { latin: "Arauca", zh: "阿劳卡", country: "Colombia" },
  { latin: "Atlántico", zh: "大西洋", country: "Colombia" },
  { latin: "Bolívar", zh: "玻利瓦尔", country: "Colombia" },
  { latin: "Boyacá", zh: "博亚卡", country: "Colombia" },
  { latin: "Caldas", zh: "卡尔达斯", country: "Colombia" },
  { latin: "Caquetá", zh: "卡克塔", country: "Colombia" },
  { latin: "Casanare", zh: "卡萨纳雷", country: "Colombia" },
  { latin: "Cauca", zh: "考卡", country: "Colombia" },
  { latin: "Cesar", zh: "塞萨尔", country: "Colombia" },
  { latin: "Chocó", zh: "乔科", country: "Colombia" },
  { latin: "Córdoba", zh: "科尔多瓦", country: "Colombia" },
  { latin: "Cundinamarca", zh: "昆迪纳马卡", country: "Colombia" },
  { latin: "Guaviare", zh: "瓜维亚雷", country: "Colombia" },
  { latin: "Huila", zh: "维拉", country: "Colombia" },
  { latin: "La Guajira", zh: "瓜希拉", country: "Colombia" },
  { latin: "Magdalena", zh: "马格达莱纳", country: "Colombia" },
  { latin: "Meta", zh: "梅塔", country: "Colombia" },
  { latin: "Nariño", zh: "纳里尼奥", country: "Colombia" },
  { latin: "Norte de Santander", zh: "北桑坦德", country: "Colombia" },
  { latin: "Putumayo", zh: "普图马约", country: "Colombia" },
  { latin: "Quindío", zh: "金迪奥", country: "Colombia" },
  { latin: "Risaralda", zh: "里萨拉尔达", country: "Colombia" },
  { latin: "Santander", zh: "桑坦德", country: "Colombia" },
  { latin: "Sucre", zh: "苏克雷", country: "Colombia" },
  { latin: "Tolima", zh: "托利马", country: "Colombia" },
  { latin: "Valle del Cauca", zh: "考卡山谷", country: "Colombia" },
  { latin: "Vichada", zh: "维查达", country: "Colombia" },

  // Brazil — estados
  { latin: "Acre", zh: "阿克里", country: "Brazil" },
  { latin: "Alagoas", zh: "阿拉戈斯", country: "Brazil" },
  { latin: "Amapá", zh: "阿马帕", country: "Brazil" },
  { latin: "Bahia", zh: "巴伊亚", country: "Brazil" },
  { latin: "Ceará", zh: "塞阿拉", country: "Brazil" },
  { latin: "Distrito Federal", zh: "联邦区", country: "Brazil" },
  { latin: "Espírito Santo", zh: "圣埃斯皮里图", country: "Brazil" },
  { latin: "Goiás", zh: "戈亚斯", country: "Brazil" },
  { latin: "Maranhão", zh: "马拉尼昂", country: "Brazil" },
  { latin: "Mato Grosso do Sul", zh: "南马托格罗索", country: "Brazil" },
  { latin: "Mato Grosso", zh: "马托格罗索", country: "Brazil" },
  { latin: "Minas Gerais", zh: "米纳斯吉拉斯", country: "Brazil" },
  { latin: "Pará", zh: "帕拉", country: "Brazil" },
  { latin: "Paraíba", zh: "帕拉伊巴", country: "Brazil" },
  { latin: "Paraná", zh: "巴拉那", country: "Brazil" },
  { latin: "Pernambuco", zh: "伯南布哥", country: "Brazil" },
  { latin: "Piauí", zh: "皮奥伊", country: "Brazil" },
  { latin: "Rio de Janeiro", zh: "里约热内卢", country: "Brazil" },
  { latin: "Rio Grande do Norte", zh: "北里奥格兰德", country: "Brazil" },
  { latin: "Rio Grande do Sul", zh: "南里奥格兰德", country: "Brazil" },
  { latin: "Rondônia", zh: "朗多尼亚", country: "Brazil" },
  { latin: "Roraima", zh: "罗赖马", country: "Brazil" },
  { latin: "Santa Catarina", zh: "圣卡塔琳娜", country: "Brazil" },
  { latin: "São Paulo", zh: "圣保罗", country: "Brazil" },
  { latin: "Sergipe", zh: "塞尔希培", country: "Brazil" },
  { latin: "Tocantins", zh: "托坎廷斯", country: "Brazil" },

  // Chile — regiones, each 大区 in Chinese as Peru's departments are. The
  // latin is the part a title actually carries after "Región de/del": the
  // official names of three are longer (Libertador General Bernardo
  // O'Higgins; Aysén del General Carlos Ibáñez del Campo; Magallanes y de la
  // Antártica Chilena) and no title spells them out. The capital region is
  // 圣地亚哥首都大区 — "Metropolitana" alone translates to nothing a reader
  // can place. 阿劳卡尼亚 contains Colombia's 阿劳卡 whole; the longest-match
  // rule in findRegionNameMismatches is what keeps the two apart.
  { latin: "Arica y Parinacota", zh: "阿里卡和帕里纳科塔", country: "Chile" },
  { latin: "Tarapacá", zh: "塔拉帕卡", country: "Chile" },
  { latin: "Antofagasta", zh: "安托法加斯塔", country: "Chile" },
  { latin: "Atacama", zh: "阿塔卡马", country: "Chile" },
  { latin: "Coquimbo", zh: "科金博", country: "Chile" },
  { latin: "Valparaíso", zh: "瓦尔帕莱索", country: "Chile" },
  { latin: "Metropolitana de Santiago", zh: "圣地亚哥首都", country: "Chile" },
  { latin: "O'Higgins", zh: "奥希金斯", country: "Chile" },
  { latin: "Maule", zh: "马乌莱", country: "Chile" },
  { latin: "Ñuble", zh: "纽布莱", country: "Chile" },
  { latin: "Biobío", zh: "比奥比奥", country: "Chile" },
  { latin: "La Araucanía", zh: "阿劳卡尼亚", country: "Chile" },
  { latin: "Los Ríos", zh: "洛斯里奥斯", country: "Chile" },
  { latin: "Los Lagos", zh: "洛斯拉各斯", country: "Chile" },
  { latin: "Aysén", zh: "艾森", country: "Chile" },
  { latin: "Magallanes", zh: "麦哲伦", country: "Chile" },
];

/** Accent- and case-insensitive, so Áncash and Ancash are the same name. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const BY_LATIN = new Map(REGION_NAMES.map((entry) => [fold(entry.latin), entry]));

export type RegionMismatch = {
  /** The whole 中文（Latin）pair as it appears. */
  found: string;
  /** The region the parenthetical names. */
  latin: string;
  /** The Chinese that region should carry. */
  expectedZh: string;
  /** The region the Chinese actually names. */
  actualZh: string;
  country: string;
};

/** Every 中文（Latin）pair in the text, as [chineseBefore, latinInside]. */
const ANNOTATED = /([一-鿿]{2,})(?:省|州|大区|区|市)?[（(]\s*([^）)]{2,40}?)\s*[）)]/g;

/**
 * Chinese/Latin region pairs in `text` that name two DIFFERENT regions.
 *
 * Deliberately narrow, because a false positive here is worse than a miss: it
 * would send someone to "fix" a correct translation. A pair is reported only
 * when BOTH halves are first-level regions in this table AND they are not the
 * same one. The common and correct pattern — a province or municipality
 * annotated with its department, 瓦里省（Áncash）— has a Chinese half that is
 * not in the table at all, so it is never flagged.
 */
export function findRegionNameMismatches(text: string): RegionMismatch[] {
  const mismatches: RegionMismatch[] = [];

  for (const match of text.matchAll(ANNOTATED)) {
    const [whole, chineseBefore, latinInside] = match;
    const entry = BY_LATIN.get(fold(latinInside));
    if (entry === undefined) continue;

    // Which region does the CHINESE name? Longest match wins, and that
    // ordering is load-bearing rather than tidiness: several Chinese names
    // contain another one whole — 南马托格罗索 contains 马托格罗索,
    // 南下加利福尼亚 contains 下加利福尼亚, 北桑坦德 contains 桑坦德. Asking
    // "does the Chinese contain the expected name" instead would read
    // 南马托格罗索州（Mato Grosso）— a real mismatch between a state and the
    // state south of it — as agreement.
    const actual = REGION_NAMES
      .filter((candidate) => chineseBefore.includes(candidate.zh))
      .sort((a, b) => b.zh.length - a.zh.length)[0];
    // The Chinese is not a first-level region at all: a province, a
    // municipality or a facility annotated with the department it sits in.
    // That is the correct, common pattern and there is nothing to compare.
    if (actual === undefined) continue;
    if (fold(actual.latin) === fold(entry.latin)) continue;

    mismatches.push({
      found: whole,
      latin: entry.latin,
      expectedZh: entry.zh,
      actualZh: actual.zh,
      country: entry.country,
    });
  }

  return mismatches;
}
