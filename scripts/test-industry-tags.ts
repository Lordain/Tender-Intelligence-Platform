/**
 * Which 行业 tags a real title gets.
 *
 * lib/industry.ts had no test at all until 2026-09-18, and the gap showed:
 * roads and bridges carried no 交通 tag, irrigation works carried no 水利
 * tag, and an audit over the fixture corpus found eleven KEPT tenders with
 * no tag but "general" — substation switchgear, a generating station, a
 * biometric access-control system. A tender nobody can reach through the
 * industry filter is, for the person browsing by industry, not in the feed.
 *
 * The relevance suite could not have caught any of it: test-relevance.ts
 * passes `fixture.industries ?? []` straight through, so it exercises the
 * tier rules, not the tagger.
 *
 * Both directions matter. A missing tag hides a real opportunity; a wrong
 * tag fills a filter with noise, which is how a filter stops being used.
 * So every case here names the tags that MUST be present, and the ones that
 * must NOT be.
 *
 * Usage: npm run test:industry-tags
 */
import { classifyIndustries, type IndustryKey } from "../lib/industry";

type Case = {
  title: string;
  /** Tags that must be present. */
  expect: IndustryKey[];
  /** Tags that must NOT be present. */
  reject?: IndustryKey[];
  note: string;
};

const cases: Case[] = [
  // --- Brazil's river-named states (2026-09-18) ---------------------------
  // Three of the 27 states are named after a river, and the water pattern's
  // `\br[íi]o\b` matches the word inside the state name — so every tender in
  // them carried a water tag whatever it bought. Found on the real ANEEL
  // transmission auction: lot 1 (Rio de Janeiro) and lot 3 (Rio Grande do
  // Norte) came out ["power","water"] while identical lots elsewhere came out
  // ["power"]. Never an ANEEL problem — the PNCP feed is full of rows there.
  {
    title: "LOTE 1, composto pelas seguintes instalações nos Estados do Rio de Janeiro, São Paulo e Minas Gerais: SE 500/138 kV Nova Extrema",
    expect: ["power"],
    note: "Real, from the captured Leilão 001/2026 page. The州名 must not become a water signal.",
  },
  {
    title: "LOTE 3, instalações nos Estados do Rio Grande do Norte e Ceará: SE 500 kV Ceará Mirim II - Compensação Síncrona",
    expect: ["power"],
    note: "Same auction, second measured case.",
  },
  {
    // Spanish vocabulary on purpose: classifyIndustries() is the Spanish pass,
    // and the Portuguese one is merged in only by classifyStoredTender(). A
    // fully Portuguese title returns ["general"] here by design, which would
    // have made this case prove nothing about the strip.
    title: "Pavimentación de vías urbanas en Rio Grande do Sul",
    expect: ["construction", "transportation"],
    note: "Rio Grande do Sul was not separately measured — same phrase, same construction, Brazil's fifth-largest state. Waiting for it would be waiting for a bug already proven twice on the other two.",
  },
  {
    title: "Construcción de planta de tratamiento de aguas residuales en Rio de Janeiro",
    expect: ["water"],
    note: "The strip removes the state name, not the tender: a real water project in Rio keeps its tag.",
  },
  {
    title: "Recuperação das margens do rio Tietê",
    expect: ["water"],
    note: "And a real river anywhere else still counts as water.",
  },
  // --- roads and bridges are transport, not only civil works --------------
  {
    title: "MEJORAMIENTO DE LA CARRETERA DEPARTAMENTAL PE-3S, TRAMO KM 12+000 AL KM 38+500",
    expect: ["transportation", "construction"],
    note: "Real shape (2026-09-18, per the user: 很多道路工程、桥梁工程没有交通标签). Every road term lived in the construction pattern alone.",
  },
  {
    title: "CONSTRUCCIÓN DEL PUENTE VEHICULAR SOBRE EL RÍO MAGDALENA Y SUS ACCESOS",
    expect: ["transportation", "construction"],
    note: "A bridge is transport infrastructure. Both tags, not one — the same both-at-once case this file's header uses railways to describe.",
  },
  {
    title: "MEJORAMIENTO DEL SERVICIO DE TRANSITABILIDAD VIAL EN EL JIRÓN LOS ANDES",
    expect: ["transportation"],
    note: "`transitabilidad` is Peru's own word for road serviceability and carries a large share of SEACE's road titles. Without it those rows had no transport signal at all.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPOS DE SEGURIDAD PARA REVISIÓN DE EQUIPAJE EN EL AEROPUERTO INTERNACIONAL",
    expect: ["transportation"],
    reject: ["construction"],
    note: "From the corpus audit. `aeropuerto` was deliberately narrowed out of the construction pattern — buying screening equipment is not building an airport — and was then in no pattern at all. It must tag transport WITHOUT re-acquiring the construction tag that narrowing removed.",
  },

  // --- irrigation is water -------------------------------------------------
  {
    title: "CONSTRUCCIÓN DE OBRAS DE ARTE; EN EL(LA) SISTEMA DE RIEGO CHAVIMOCHIC I Y II ETAPA, ITEM 02: COMPONENTE OBRAS HIDROMECÁNICAS Y ELECTROMECÁNICAS",
    expect: ["water"],
    note: "Real title (2026-09-18, per the user: 灌溉系统都加水工程的标签). The pattern had `zona de riego` — the siting phrase — but not irrigation itself.",
  },
  {
    title: "MEJORAMIENTO Y AMPLIACIÓN DEL SISTEMA DE IRRIGACIÓN, BOCATOMA Y RESERVORIO DEL CANAL DE RIEGO",
    expect: ["water"],
    note: "The other words the same works are written with. `irrigación`, `bocatoma` and `reservorio` were all absent.",
  },

  // --- body-worn cameras ---------------------------------------------------
  {
    title: "ADQUISICIÓN DE CÁMARAS DE VIDEO CORPORALES ACTIVAS (BODYCAM) PARA EL SERVICIO DE SEGURIDAD CIUDADANA",
    expect: ["ict_telecom"],
    note: "Real title (2026-09-18). Tagged here as the electronics it is, while relevance.ts deliberately refuses to read it as a videovigilancia INSTALLATION — see the lookahead in EQUIPMENT_SCALE_CAPPED_KEYWORDS. The tag and the tier are separate decisions and this is the case that separates them.",
  },

  // --- power hardware ------------------------------------------------------
  {
    title: "SUMINISTRO DE INTERRUPTORES DE POTENCIA 115 KV Y SECCIONADORES",
    expect: ["power"],
    note: "From the corpus audit — no tag at all before. High-voltage switchgear is exactly the equipment this platform exists to surface.",
  },
  {
    title: "SUMINISTRO DE CELDAS DE MEDIA TENSIÓN Y CENTRO DE TRANSFORMACIÓN",
    expect: ["power"],
    note: "Same audit, same gap.",
  },
  {
    title: "Central de Generación Co-Localizada Los Cabos",
    expect: ["power"],
    note: "Same audit. A generating station the pattern could not see, because it knew `generación eléctrica` and the title says `Central de Generación`.",
  },
  {
    title: "IMPLEMENTACION DE UNIDAD TERMINAL REMOTA REDUNDANTE PARA EL ENLACE DEL SISTEMA DE CONTROL DISTRIBUIDO DE LA CENTRAL",
    expect: ["power", "ict_telecom"],
    note: "Both, on purpose. industry.ts's own header names 'a power-plant SCADA upgrade is both power and ict_telecom' as the reason tags are an array — and until this change neither tag was produced for one.",
  },

  // --- electronic security -------------------------------------------------
  {
    title: "ADQUISICIÓN DE SISTEMA DE CONTROL DE ACCESO BIOMÉTRICO PARA INSTALACIONES ESTRATÉGICAS",
    expect: ["ict_telecom"],
    note: "From the corpus audit.",
  },
  {
    title: "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL PARA INSTALACIONES ESTRATÉGICAS",
    expect: ["ict_telecom"],
    note: "The qualified form — a real managed security-infrastructure service.",
  },
  {
    title: "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL",
    expect: [],
    reject: ["ict_telecom"],
    note: "THE PAIR THAT MATTERS. Bare, the phrase is an outsourced guard/fencing contract, and the relevance corpus expects it EXCLUDED. Tagging it gave it a target industry and it came back into the feed as 常规项目 — caught by test:relevance while this change was being written. The anchor here is copied from relevance.ts's own INCLUDE_OVERRIDE_KEYWORDS entry so the two files cannot disagree about which of these two is which.",
  },

  // --- place names that are not infrastructure -----------------------------
  {
    title: "ADQUISICIÓN DE LECHE FRESCA PARA LOS TRABAJADORES OPERATIVOS DE LA MUNICIPALIDAD DISTRITAL DE PUENTE PIEDRA",
    expect: [],
    reject: ["construction", "transportation"],
    note: "Real title (2026-09-18). Puente Piedra is one of Lima's districts. Its name alone tagged a milk purchase as construction and, via relevance.ts's 建桥 keyword, promoted it to 中型项目. Now stripped before any pattern sees it — and note the reject list includes `transportation`, which is the tag the road fix would otherwise have handed it.",
  },
  {
    title: "CONSTRUCCIÓN DE PUENTE VEHICULAR EN EL MUNICIPIO DE PUERTO BOYACÁ",
    expect: ["transportation", "construction"],
    note: "The control for the stripper: it must remove the PLACE name without removing the real bridge in the same title. Puerto Boyacá goes; puente vehicular stays.",
  },

  // --- a plain passenger car is a vehicle ---------------------------------
  {
    title: "ADQUISICIÓN DE AUTOMÓVIL TIPO SEDAN PARA LA COORDINACIÓN ESTATAL DEL SERVICIO NACIONAL DE EMPLEO",
    expect: ["vehicles"],
    note: "Real title (2026-09-18, per the user: 增加车辆). Carried no tag at all: the list had every kind of WORK vehicle — camión, camioneta, autobús, excavadora, grúa — and not the plain passenger car, which is the one word a government car order actually uses.",
  },
  {
    title: "SERVICIO DE ASESORÍA JURÍDICA PARA LA ELABORACIÓN DEL AUTO DE APERTURA DEL PROCEDIMIENTO ADMINISTRATIVO",
    expect: [],
    reject: ["vehicles"],
    note: "Why the vehicle pattern says automóvil and not a bare auto: in Spanish an `auto` is also a court ruling, and legal-services procurement says so in the title. A filter that answers a car query with a lawsuit is a filter people stop using.",
  },
];

let failures = 0;
console.log("行业标签\n");
for (const c of cases) {
  const tags = classifyIndustries(c.title);
  const missing = c.expect.filter((t) => !tags.includes(t));
  const wrong = (c.reject ?? []).filter((t) => tags.includes(t));
  if (missing.length === 0 && wrong.length === 0) {
    console.log(`  OK    [${tags.join(", ")}]  ${c.title.slice(0, 62)}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${c.title.slice(0, 72)}`);
    console.log(`        实际 [${tags.join(", ")}]`);
    if (missing.length > 0) console.log(`        缺少 [${missing.join(", ")}]`);
    if (wrong.length > 0) console.log(`        不该有 [${wrong.join(", ")}]`);
  }
}
console.log(`\n${cases.length - failures}/${cases.length} checks passed.`);
if (failures > 0) process.exit(1);

