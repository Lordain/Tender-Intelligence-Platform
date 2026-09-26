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
  // --- Rail beyond Mexico's wording (2026-09-26) --------------------------
  // The user noticed every 铁路/地铁 tender on the site was Mexican. The
  // relevance rules kept rail titles from every country, but the transport
  // tag knew Mexico's words (ferroviario, tren de pasajeros, metro) and not
  // rolling stock, rails, or Brazil's Portuguese — so a Brazilian VLT or a
  // Chilean rail supply would land in 综合, invisible under 交通基建.
  { title: "ADQUISICIÓN DE MATERIAL RODANTE PARA EL REGIOTRAM DEL NORTE", expect: ["transportation"], note: "机车车辆采购" },
  { title: "Suministro de rieles y durmientes para EFE Trenes de Chile", expect: ["transportation"], note: "钢轨与轨枕" },
  { title: "ADQUISICIÓN DE TRENES PARA LA LÍNEA 1 DEL METRO DE LIMA", expect: ["transportation"], note: "地铁列车" },
  { title: "Contratação de obras de implantação do VLT (Veículo Leve sobre Trilhos) de Salvador", expect: ["transportation"], note: "巴西轻轨" },
  { title: "Aquisição de trens para a Linha 9 da CPTM", expect: ["transportation"], note: "巴西列车采购" },
  { title: "Obras de construção da Ferrovia de Integração Oeste-Leste (FIOL) lote 2", expect: ["transportation"], note: "巴西铁路工程" },
  { title: "Implantação da Linha 6 do Metrô de São Paulo", expect: ["transportation"], note: "metrô 带重音" },
  { title: "Mantenimiento del tren de aterrizaje de aeronave", expect: [], reject: ["transportation"], note: "起落架不是火车" },

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

  // Portuguese, added with the ANTAQ connector (2026-09-19). The first three
  // are real ANTAQ hearing sub-headings; the rest guard the narrowness the
  // pattern was written with.
  {
    title: "ARRENDAMENTO DA ÁREA ITJ01 LOCALIZADA NO PORTO ORGANIZADO DE ITAJAÍ/SC",
    note: "ANTAQ 07/2026 的真实副标题：伊塔雅伊港集装箱码头特许",
    expect: ["transportation"],
  },
  {
    title: "CONCESSÃO DO SISTEMA AQUAVIÁRIO INTEGRADO DO SUL E LAGOA MIRIM, DENOMINADO SAIP SUL-MIRIM",
    note: "ANTAQ 06/2026：内河航道系统特许",
    expect: ["transportation"],
  },
  {
    title: "CONCESSÃO DO CANAL DE ACESSO DO PORTO ORGANIZADO DE PARANAGUÁ",
    note: "ANTAQ 02/2026 一类：港口进港航道特许",
    expect: ["transportation"],
  },
  {
    title: "Dragagem de manutenção do berço de atracação do terminal portuário",
    note: "疏浚 + 泊位 + portuário，三个词各自都该命中",
    expect: ["transportation"],
  },
  // Bare "porto" is a city name as often as a port — the same judgement the
  // Spanish list already records for "puerto".
  {
    title: "AQUISIÇÃO DE MOBILIÁRIO PARA A SECRETARIA MUNICIPAL DE PORTO ALEGRE",
    note: "阿雷格里港是城市名，不是港口 —— 和西语 puerto 一样的判断",
    expect: [],
    reject: ["transportation"],
  },
  // And a bare "terminal" is a bus stop, a computer or a point of sale.
  {
    title: "CONTRATAÇÃO DE EMPRESA PARA MANUTENÇÃO DE TERMINAL DE AUTOATENDIMENTO BANCÁRIO",
    note: "银行自助终端，光一个 terminal 不算交通",
    expect: [],
    reject: ["transportation"],
  },
  // --- renewable generation is 电力, never 能矿 (2026-09-20) ---------------
  // The user's call on the real Colombian title below: 不要有太阳能相关词都加
  // 能矿标签，都用电力. These rows used to carry BOTH tags, and 能矿 was the
  // half that said nothing true — it put a rural PV array in the same filter
  // as a refinery, for a reader who selects 能矿 precisely to avoid it.
  {
    title: "INSTALACIÓN DE SISTEMAS DE ENERGÍA SOLAR FOTOVOLTAICA EN ZONAS NO INTERCONECTADAS",
    note: "真实哥伦比亚标题，用户指出的那条",
    expect: ["power"],
    reject: ["energy_mining"],
  },
  {
    title: "CONSTRUCCIÓN DE PLANTA SOLAR DE 50 MW Y SU LÍNEA DE EVACUACIÓN",
    note: "光伏电站本身也是发电资产",
    expect: ["power"],
    reject: ["energy_mining"],
  },
  {
    title: "SUMINISTRO Y MONTAJE DE AEROGENERADORES PARA PARQUE EÓLICO",
    note: "风电同理——否则风电归能矿、光伏归电力，两种发电资产落在两个筛选里",
    expect: ["power"],
    reject: ["energy_mining"],
  },
  // The other half of the move: extraction and fuels keep the tag, which is
  // what 能矿 is for. A rule that dropped these would have emptied it.
  {
    title: "SERVICIOS DE MANTENIMIENTO INDUSTRIAL EN LA REFINERÍA DE TULA",
    note: "炼油厂仍然是能矿",
    expect: ["energy_mining"],
    reject: ["power"],
  },
  {
    title: "CONSTRUCCIÓN DE GASODUCTO Y ESTACIÓN DE COMPRESIÓN DE GAS NATURAL",
    note: "天然气管道仍然是能矿",
    expect: ["energy_mining"],
  },
  {
    title: "ADQUISICIÓN DE EQUIPOS PARA PLANTA DE BIOCOMBUSTIBLE",
    note: "生物燃料是燃料生产，不是发电，留在能矿",
    expect: ["energy_mining"],
    reject: ["power"],
  },
  // Two keywords were written without a LEFT word boundary, so they matched
  // inside longer Spanish words. Found 2026-09-24 by sweeping one live 5-day
  // Chilean import (1,270 rows) rather than by reading the patterns: every
  // instrument whose name ends in -metro was filed as public transport, and a
  // tissue-regeneration membrane as power generation. Both directions are
  // pinned here — the false positives AND the real matches that must survive
  // the boundary, which is the half a boundary fix usually breaks.
  {
    title: "Turbidimetro Laboratorio Clinico",
    note: "浊度计不是地铁 —— 「metro」曾匹配到 turbidí-metro 里面",
    expect: ["general"],
    reject: ["transportation"],
  },
  {
    title: "ADQUISICIÓN DE BALANZA CON TALLÍMETRO PARA EL HOSPITAL",
    note: "身高尺同理。healthcare 是对的（医院采购），要拦的是 transportation",
    expect: ["healthcare"],
    reject: ["transportation"],
  },
  {
    title: "SERVICIO DE CONTROL Y MANTENCION DE PLAGAS EN EL PERÍMETRO",
    note: "周界灭虫同理",
    expect: ["general"],
    reject: ["transportation"],
  },
  {
    title: "Ampliación de la red del Metro de Santiago",
    note: "真正的地铁必须留住",
    expect: ["transportation"],
  },
  {
    title: "CONVENIO LAMINAS REGENERADORAS DE TEJIDO",
    note: "组织再生膜不是发电 —— 「generador」曾匹配到 re-generadoras 里面",
    expect: ["general"],
    reject: ["power"],
  },
  {
    title: "SUMINISTRO DE GENERADORES DE EMERGENCIA",
    note: "真正的发电机必须留住（复数）",
    expect: ["power"],
  },
  {
    title: "PLANTA GENERADORA TERMOELECTRICA",
    note: "阴性形式也必须留住 —— 加边界最容易漏掉的就是它",
    expect: ["power"],
  },
  {
    title: "MANTENCION DE TURBOGENERADOR",
    note: "汽轮发电机是真的复合词，显式保留",
    expect: ["power"],
  },
  // 2026-09-25 — ten live titles the user found tagged 综合.
  { title: "REHABILITACIÓN DE CARCAMO ESTADIO, COLECTOR SAN CARLOS, NOGALES, SONORA.", expect: ["water"], reject: ["general"], note: "cárcamo（泵井）+ colector（污水干管）是水工程" },
  { title: "TRABAJOS DE REVESTIMIENTO CON CONCRETO HIDRÁULICO DE CANALES DISPERSOS CHIHUAHUA", expect: ["water"], reject: ["general"], note: "渠道衬砌是水工程" },
  { title: "OBRAS DE MEJORAMIENTO HIDRÁULICO PRIORIZADAS PARA LOS CUERPOS DE AGUA EN LA JURISDICCIÓN DE LA CORPORACIÒN AUTONOMA REGIONAL DEL CANAL DEL DIQUE", expect: ["water"], reject: ["general"], note: "水体、水利改善工程" },
  { title: "ADQUISICIÓN DE ALTA TECNOLOGÍA QUIRÚRGICA E IMAGENOLÓGICA, MESA DE OPERACIONES HIDRÁULICA/ELÉCTRICA, EQUIPO ECÓGRAFO-ULTRASONIDO, EQUIPO ECOGRADO Y ELECTROENCEFALÓGRAFO", expect: ["healthcare"], reject: ["general", "water", "power"], note: "手术、影像设备是医疗；「HIDRÁULICA/ELÉCTRICA」只是手术台的规格" },
  { title: "ADQUISICION DE AMBULANCIA URBANA A NIVEL DISTRITAL EN MARCAVELICA Y CATACAOS-PIURA", expect: ["vehicles", "healthcare"], note: "救护车 = 车辆 + 医疗" },
  { title: "ADQUISICIÓN DE 31 AMBULANCIAS", expect: ["vehicles", "healthcare"], note: "救护车复数" },
  { title: "CONTRATACIÓN PARA LA EJECUCIÓN DE LA OBRA: RENOVACION DE RED SECUNDARIA; EN EL (LA) SUMINISTRO ELECTRICO AA.HH. RUTA DEL SOL DISTRITO DE MARCONA", expect: ["power"], reject: ["general"], note: "秘鲁的低压配网按「供电服务」命名" },
  { title: "AMPLIACIÓN DEL CUERPO EXISTENTE TRAMO ZACUALTIPÁN – TEHUETLÁN", expect: ["transportation", "construction"], note: "公路加宽：cuerpo + 「tramo 甲地 – 乙地」" },
  { title: "REHABILITACIÓN DE LA PB MATADERO Y PB LAURELES II EN TIJUANA, BAJA CALIFORNIA", expect: ["water"], reject: ["general"], note: "PB = planta de bombeo（提泵站）" },
  { title: "Registro de Preços para futura e eventual contratação de empresa especializada para execução de serviços de engenharia voltados à manutenção, conservação, recuperação e melhoria da infraestrutura viária urbana e rural dos Municípios Consorciados ao CODAP.", expect: ["transportation", "construction"], reject: ["general"], note: "葡语道路词：infraestrutura viária" },
  { title: "Pavimentação da Rodovia BA-449, no Trecho: Cotegipe - Acesso ao Distrito de Jupaguá", expect: ["transportation", "construction"], note: "葡语：rodovia / pavimentação" },
  // …and what those rules must not pull in.
  { title: "PAVIMENTACIÓN CON CONCRETO HIDRÁULICO DE CALLE 5 DE MAYO", expect: ["construction"], reject: ["water"], note: "concreto hidráulico 也是铺路混凝土，不是水工程" },
  { title: "REMODELACIÓN DE LA PB DEL EDIFICIO SEDE", expect: ["construction"], reject: ["water"], note: "PB 也是 planta baja（一楼）" },
  { title: "CONSTRUCCIÓN DE PB Y PLANTA ALTA DE OFICINAS", expect: ["construction"], reject: ["water"], note: "同上" },
  { title: "ADQUISICIÓN DE MATERIAL QUIRÚRGICO Y DE CURACIÓN", expect: ["general"], reject: ["healthcare"], note: "手术耗材按既定口径不算医疗设备" },
  { title: "SERVICIO DE TRANSMISIÓN EN CANAL DE TELEVISIÓN ABIERTA", expect: [], reject: ["water"], note: "电视频道不是渠道" },
  { title: "INSTALACIÓN DE COLECTOR SOLAR EN ALBERCA", expect: [], reject: ["water"], note: "太阳能集热器不是污水干管" },
  { title: "AMPLIACION CONDUCCION PLANTA DE TRATAMIENTO DE AGUA POTABLE LAS FLORES - TANQUE DE REBOMBEO SALGAR TRAMO LOS MANATIES - PUERTO", expect: ["water"], reject: ["transportation"], note: "输水管线的 tramo 不是公路（全库回放唯一误报）" },
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

