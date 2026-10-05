import type { LocalizedText, Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { classifyEnergyAuction, ENERGY_AUCTIONS_SOURCE_NAME } from "@/lib/relevance-energy-auctions";

export { ENERGY_AUCTIONS_SOURCE_NAME };

/**
 * National energy auctions, kept by hand (user, 2026-10-04: 「能源拍卖」数据源，
 * 包括历史拍卖 ← OK, 会写入现网 ← OK).
 *
 * These are the largest new-energy opportunities in the region — a supply
 * auction for 2,835 GWh a year, 700 MW of batteries in one call — and none of
 * them is on a procurement portal the importers read: Chile's CNE, Argentina's
 * Secretaría de Energía with CAMMESA, Colombia's Ministerio de Minas y
 * Energía with the Bolsa Mercantil, the Dominican Republic's three
 * distribution companies through their Consejo Unificado (CUED, portal
 * compraenergia.do — not the DGCP, which carries none of them) each run their
 * own process a few times a year. So each auction is one record here, written by the daily job
 * (scripts/cron-energy-auctions.ts) and refreshed in place when a record
 * changes.
 *
 * Every fact below was read on 2026-10-04 from the organiser's own page or,
 * where noted, the trade press that reported the organiser's resolution; the
 * `sources` of each record are those pages. Nothing is estimated: no amount is
 * set where the organiser published none (a supply auction prices energy, it
 * has no contract value), and the investment figures announced with an award
 * are quoted in the summary, not stored as an estimated value.
 *
 * Historical auctions (awarded) are kept on purpose, for the record and for
 * search (user: 已经截止的项目，是否能把历史招标信息加入(增加我们的曝光量)): they
 * are stored as 已中标, which the closed-deadline gate in upsert-tenders.ts
 * lets through, and they never appear as open.
 *
 * Brazil's LRCAP storage auctions (December 2026) are NOT here: they come in
 * through the ANEEL path (lib/ingestion/aneel-geracao-mapper.ts), and a
 * second row would duplicate them.
 *
 * Adding an auction: append a record, with its sources; keep the slug stable
 * once written, since it is the row's identity.
 */

type EnergyAuction = {
  slug: string;
  tenderNumber: string;
  country: "Chile" | "Argentina" | "Colombia" | "Dominican Republic";
  buyer: string;
  title: LocalizedText;
  summary: LocalizedText;
  procedureType: string;
  scopeType: TenderScopeType;
  status: TenderStatus;
  publicationDate: string;
  submissionDeadline?: string;
  awardDate?: string;
  internationalOpen: boolean;
  /**
   * The process's own official page — where the bases, circulars and results
   * are published — not a press release about it (user, 2026-10-05: 没有具体
   * 的招标官网吗？现在的连进去更像是个新闻报道). Press pages stay in `sources`.
   */
  sourceUrl: string;
  sources: string[];
};


export const ENERGY_AUCTIONS: readonly EnergyAuction[] = [
  {
    slug: "energia-chile-cne-licitacion-suministro-2026-01",
    tenderNumber: "CNE Licitación de Suministro 2026/01",
    country: "Chile",
    buyer: "Comisión Nacional de Energía (CNE)",
    title: {
      zh: "智利 2026/01 受管制用户供电招标（2,835 GWh/年，2029–2044 年供电）",
      es: "Licitación de Suministro 2026/01 para clientes regulados (2.835 GWh/año, suministro 2029–2044)",
      en: "Chile Supply Auction 2026/01 for regulated customers (2,835 GWh/yr, supply 2029–2044)",
    },
    summary: {
      zh: "智利国家能源委员会（CNE）组织的长期供电招标，为受价格管制的用户采购电量与容量，共 2,835 GWh/年，分四个区域、三个时段。第 1 区块供电期 2029 年 1 月 1 日至 2043 年 12 月 31 日，第 2 区块 2030 年 1 月 1 日至 2044 年 12 月 31 日。新报价不得以煤、石油焦、柴油或 6 号燃料油为支撑，储能可作为备用。征询期已于 2026 年 8 月 28 日结束，答复及招标文件修改于 10 月 2 日公布；2026 年 12 月 4 日接收报价，预计 2027 年 1 月 13 日授标。参与方为发电企业，中国光伏、风电和储能设备厂商可通过为中标项目供货参与。",
      es: "Licitación de largo plazo de la Comisión Nacional de Energía para el suministro de energía y potencia a clientes sujetos a regulación de precios: 2.835 GWh/año en cuatro zonas y tres bloques horarios. Bloque 1 del 1 de enero de 2029 al 31 de diciembre de 2043; Bloque 2 del 1 de enero de 2030 al 31 de diciembre de 2044. Se excluyen nuevas ofertas respaldadas por carbón, petcoke, diésel o fuel oil N.º 6; el almacenamiento puede servir de respaldo. Consultas cerradas el 28 de agosto de 2026; respuestas y modificaciones de bases el 2 de octubre; recepción de ofertas el 4 de diciembre de 2026; adjudicación prevista el 13 de enero de 2027.",
      en: "A long-term auction by Chile's National Energy Commission for energy and capacity for price-regulated customers: 2,835 GWh/yr across four zones and three hourly blocks. Block 1 runs 1 Jan 2029 – 31 Dec 2043, Block 2 1 Jan 2030 – 31 Dec 2044. New offers backed by coal, petcoke, diesel or No. 6 fuel oil are excluded; storage may serve as backing. Questions closed 28 Aug 2026; answers and amended bases published 2 Oct; offers due 4 Dec 2026; award expected 13 Jan 2027.",
    },
    procedureType: "Licitación Pública Nacional e Internacional de Suministro (Ley General de Servicios Eléctricos, art. 131)",
    scopeType: "equipment_services",
    status: "open",
    publicationDate: "2026-07-20T12:00:00-04:00",
    submissionDeadline: "2026-12-04T12:00:00-03:00",
    awardDate: "2027-01-13T12:00:00-03:00",
    internationalOpen: true,
    sourceUrl: "https://www.licitacioneselectricas.cl/licitaciones/licitacion-de-suministro-2026-01",
    sources: [
      "https://www.licitacioneselectricas.cl/licitaciones/licitacion-de-suministro-2026-01",
      "https://www.cne.cl/prensa/prensa-2026/07-julio-2026/webinar-abordo-principales-aspectos-de-la-licitacion-electrica-2026-01-para-clientes-regulados/",
      "https://g5noticias.cl/2026/07/20/cne-publica-bases-de-la-licitacion-de-suministro-2026-01-para-abastecer-a-clientes-regulados-entre-2029-y-2044/",
    ],
  },
  {
    slug: "energia-chile-cne-licitacion-suministro-2025-01",
    tenderNumber: "CNE Licitación de Suministro 2025/01",
    country: "Chile",
    buyer: "Comisión Nacional de Energía (CNE)",
    title: {
      zh: "智利 2025/01 受管制用户供电招标（3,360 GWh/年，已授标）",
      es: "Licitación de Suministro 2025/01 para clientes regulados (3.360 GWh/año) — adjudicada",
      en: "Chile Supply Auction 2025/01 for regulated customers (3,360 GWh/yr) — awarded",
    },
    summary: {
      zh: "智利国家能源委员会（CNE）的四年期供电招标，共 3,360 GWh/年，约占 2027 年预计受管制需求的 11%，分北部、中部、中南部、南部四个区域和三个时段。2025 年 11 月 14 日共 6 家企业提交 708 份报价，为需求量的 3.9 倍；2025 年 12 月 11 日授标，Enel Generación Chile 中标全部电量。可作为了解智利供电招标竞争格局与价格水平的参考。",
      es: "Licitación de suministro por cuatro años de la Comisión Nacional de Energía: 3.360 GWh/año, cerca del 11 % de la demanda regulada proyectada para 2027, en cuatro zonas (Norte, Centro, Centro-Sur y Sur) y tres bloques horarios. El 14 de noviembre de 2025 seis empresas presentaron 708 ofertas, 3,9 veces la energía requerida; adjudicada el 11 de diciembre de 2025: Enel Generación Chile se adjudicó el 100 % de la energía.",
      en: "A four-year supply auction by Chile's National Energy Commission: 3,360 GWh/yr, about 11% of projected 2027 regulated demand, in four zones and three hourly blocks. Six companies submitted 708 offers on 14 Nov 2025, 3.9 times the energy sought; awarded 11 Dec 2025, with Enel Generación Chile taking 100% of the energy.",
    },
    procedureType: "Licitación Pública Nacional e Internacional de Suministro (Ley General de Servicios Eléctricos, art. 131)",
    scopeType: "equipment_services",
    status: "awarded",
    // Bases definitivas, Res. Ex. CNE N.º 221 (30 April 2025); the preliminary
    // bases were published 21 March 2025.
    publicationDate: "2025-04-30T12:00:00-04:00",
    submissionDeadline: "2025-11-14T12:00:00-03:00",
    awardDate: "2025-12-11T12:00:00-03:00",
    internationalOpen: true,
    sourceUrl: "https://www.licitacioneselectricas.cl/licitaciones/licitacion-de-suministro-2025-01",
    sources: [
      "https://www.licitacioneselectricas.cl/licitaciones/licitacion-de-suministro-2025-01",
      "https://www.cne.cl/prensa/prensa-2025/12-diciembre-2025/cne-adjudica-licitacion-de-suministro-2025-01-con-alta-participacion-y-oferta-economicamente-mas-conveniente/",
      "https://www.cne.cl/prensa/prensa-2025/11-noviembre-2025/licitacion-de-suministro-2025-01-seis-empresas-presentan-sus-ofertas/print/",
      "https://www.cne.cl/prensa/prensa-2025/05-mayo-2025/cne-aprueba-bases-definitivas-de-licitacion-de-suministro-electrico-para-clientes-regulados/print/",
    ],
  },
  {
    slug: "energia-argentina-almasadi-2026",
    tenderNumber: "SE Res. 50/2026 — AlmaSADI",
    country: "Argentina",
    buyer: "Secretaría de Energía de la Nación / CAMMESA",
    title: {
      zh: "阿根廷 AlmaSADI 全国储能招标（700 MW 电池储能，已授标）",
      es: "AlmaSADI — almacenamiento para reserva y confiabilidad en el MEM (700 MW) — adjudicada",
      en: "Argentina AlmaSADI national battery-storage tender (700 MW) — awarded",
    },
    summary: {
      zh: "阿根廷能源秘书处第 50/2026 号决议（2026 年 3 月 2 日）发起的全国及国际公开招标，在全国关键电网节点建设电池储能，与电力批发市场管理公司 CAMMESA 签订储能协议，提供容量、运行备用和短期供电。2026 年 5 月 8 日递交报价，共 235 份技术报价、合计 8,338 MW，是目标的 12 倍；2026 年 7 月 7 日第 155/2026 号决议授标 20 个项目、共 700.5 MW，平均价格 8,427 美元/MW·月，预计投资约 7 亿美元。中标企业：Genneia（7 个项目）、DQD Energy（8 个）、360 Energy Solar（3 个）、Aluar（1 个）、Intermepro（1 个），覆盖布宜诺斯艾利斯省、西北、东北、沿岸和潘帕斯等 7 个区域。电池和变流设备由中标企业采购。",
      es: "Convocatoria abierta nacional e internacional (Resolución SE 50/2026, 2 de marzo de 2026) para incorporar almacenamiento en nodos críticos del SADI mediante acuerdos con CAMMESA, para potencia, reserva operativa y abastecimiento de corto plazo. Ofertas el 8 de mayo de 2026: 235 ofertas técnicas por 8.338 MW, doce veces el objetivo. Adjudicada por la Resolución SE 155/2026 (7 de julio de 2026): 700,5 MW en 20 proyectos, a un promedio de US$ 8.427 por MW-mes, con una inversión estimada de US$ 700 millones. Adjudicatarias: Genneia (7 proyectos), DQD Energy (8), 360 Energy Solar (3), Aluar (1) e Intermepro (1), en siete regiones.",
      en: "A national and international open call (Energy Secretariat Resolution 50/2026, 2 Mar 2026) for battery storage at critical nodes of Argentina's grid, contracted with CAMMESA for capacity, operating reserve and short-term supply. Offers on 8 May 2026: 235 technical offers for 8,338 MW, twelve times the target. Awarded by Resolution 155/2026 on 7 Jul 2026: 700.5 MW in 20 projects at an average US$8,427 per MW-month, about US$700 million of investment. Winners: Genneia (7 projects), DQD Energy (8), 360 Energy Solar (3), Aluar (1) and Intermepro (1), across seven regions.",
    },
    procedureType: "Convocatoria Abierta Nacional e Internacional (Resolución SE 50/2026)",
    scopeType: "works",
    status: "awarded",
    publicationDate: "2026-03-02T12:00:00-03:00",
    submissionDeadline: "2026-05-08T12:00:00-03:00",
    awardDate: "2026-07-07T12:00:00-03:00",
    internationalOpen: true,
    sourceUrl: "https://cammesaweb.cammesa.com/almasadi/",
    sources: [
      "https://cammesaweb.cammesa.com/almasadi/",
      "https://www.argentina.gob.ar/node/506660",
      "https://beccarvarela.com/novedades/almasadi-convocatoria-abierta-nacional-e-internacional-para-el-abastecimiento-de-energia-electrica-por-centrales-de-almacenamiento-para-reserva-y-confiabilidad-en-el-mem/",
      "https://econojournal.com.ar/destacada/alma-sadi-se-adjudicaron-los-700-mw-de-almacenamiento/",
    ],
  },
  {
    slug: "energia-argentina-almagba-2025",
    tenderNumber: "SE Res. 361/2025 — AlmaGBA",
    country: "Argentina",
    buyer: "Secretaría de Energía de la Nación / CAMMESA",
    title: {
      zh: "阿根廷 AlmaGBA 大布宜诺斯艾利斯储能招标（667 MW 电池储能，已授标）",
      es: "AlmaGBA — almacenamiento en el Área Metropolitana de Buenos Aires (667 MW) — adjudicada",
      en: "Argentina AlmaGBA battery-storage tender for Greater Buenos Aires (667 MW) — awarded",
    },
    summary: {
      zh: "阿根廷首个大型电池储能招标（能源秘书处第 67/2025 号决议，2025 年 2 月 17 日发起的全国及国际公开招标，目标 500 MW），在大布宜诺斯艾利斯都市区（AMBA）电网关键节点建设储能，与配电公司 Edenor、Edesur 签约，CAMMESA 作为最终付款担保方。2025 年 5 月 19 日递交报价，2025 年 9 月 2 日能源秘书处第 361/2025 号决议授标 10 个项目、共 667 MW：Edenor 供电区域 7 个项目 500 MW，Edesur 供电区域 3 个项目 167 MW；预计投资超过 5.4 亿美元，项目 12–18 个月内投运。可作为了解阿根廷储能项目价格与中标企业的参考。",
      es: "Primera licitación de almacenamiento a gran escala de Argentina (convocatoria abierta nacional e internacional, Resolución SE 67/2025 del 17 de febrero de 2025, objetivo 500 MW), en nodos críticos del Área Metropolitana de Buenos Aires, con contratos con Edenor y Edesur y CAMMESA como garante de pago en última instancia. Ofertas el 19 de mayo de 2025. Adjudicada por la Resolución SE 361/2025 (2 de septiembre de 2025): 667 MW en 10 proyectos — siete en el área de Edenor por 500 MW y tres en la de Edesur por 167 MW —, con una inversión estimada de más de US$ 540 millones y puesta en operación en 12 a 18 meses.",
      en: "Argentina's first large battery-storage tender (national and international open call, Energy Secretariat Resolution 67/2025 of 17 Feb 2025, 500 MW target), at critical nodes of the Greater Buenos Aires grid, contracted with the distributors Edenor and Edesur with CAMMESA as payment guarantor of last resort. Offers on 19 May 2025. Awarded by Energy Secretariat Resolution 361/2025 on 2 Sep 2025: 667 MW in 10 projects — seven in Edenor's area for 500 MW and three in Edesur's for 167 MW — with more than US$540 million of investment, in operation within 12 to 18 months.",
    },
    procedureType: "Convocatoria Abierta Nacional e Internacional (Resolución SE 67/2025)",
    scopeType: "works",
    status: "awarded",
    // Res. SE 67/2025, Boletín Oficial 17 February 2025; offers 19 May 2025.
    publicationDate: "2025-02-17T12:00:00-03:00",
    submissionDeadline: "2025-05-19T12:00:00-03:00",
    awardDate: "2025-09-02T12:00:00-03:00",
    internationalOpen: true,
    // The Boletín Oficial notice of Res. SE 67/2025 (17 February 2025), the call itself.
    sourceUrl: "https://cammesaweb.cammesa.com/almagba/",
    sources: [
      "https://cammesaweb.cammesa.com/almagba/",
      "https://www.boletinoficial.gob.ar/detalleAviso/primera/321235/20250217",
      "https://www.ess-news.com/2025/09/02/argentina-awards-667-mw-in-inaugural-battery-storage-tender/",
      "https://econojournal.com.ar/2025/09/almacenamiento-en-baterias-adjudicaron-proyectos-por-650-mw-y-podrian-sumar-otros-222/",
      "https://abogados.com.ar/convocatoria-de-generacion-de-almacenamiento-almagba/36352",
    ],
  },
  {
    slug: "energia-colombia-subasta-largo-plazo-2026",
    tenderNumber: "MinEnergía Res. 40208/2026 — Subasta CLPE 2026",
    country: "Colombia",
    buyer: "Ministerio de Minas y Energía / Bolsa Mercantil de Colombia",
    title: {
      zh: "哥伦比亚 2026 年长期新能源电力拍卖（995 MW 光伏 + 约 100 MW 储能，已授标）",
      es: "Subasta de contratos de largo plazo de energía 2026 (995 MW solares y ~100 MW de baterías) — adjudicada",
      en: "Colombia 2026 long-term clean-energy auction (995 MW solar, ~100 MW batteries) — awarded",
    },
    summary: {
      zh: "哥伦比亚矿业和能源部第 40208 号决议（2026 年 4 月 21 日）召集、由哥伦比亚商品交易所（BMC）执行的长期电力合同拍卖，覆盖光伏、风电、储能和混合电站，合同期 15 年，自 2030 年 1 月 1 日起供电。2026 年 7 月 29 日公布结果：共授标 995 MW 光伏和约 100 MW 电池储能；第一天成交 270 MW 光伏配 100 MW 储能，价格 315.87 比索/千瓦时（约 0.099 美元），第二天另成交 725 MW 纯光伏。主管部门未立即公布中标企业名称。可作为了解哥伦比亚光伏与储能电价水平的参考。",
      es: "Subasta de contratos de largo plazo convocada por la Resolución 40208 del Ministerio de Minas y Energía (21 de abril de 2026) y operada por la Bolsa Mercantil de Colombia, para proyectos solares, eólicos, de almacenamiento e híbridos, con contratos a 15 años desde el 1 de enero de 2030. Resultados del 29 de julio de 2026: 995 MW solares y cerca de 100 MW de baterías; en la primera jornada 270 MW solares con 100 MW de almacenamiento a 315,87 COP/kWh, en la segunda 725 MW exclusivamente solares. Los adjudicatarios no se publicaron de inmediato.",
      en: "A long-term contract auction convened by Ministry of Mines and Energy Resolution 40208 (21 Apr 2026) and run by the Bolsa Mercantil de Colombia, for solar, wind, storage and hybrid projects, with 15-year contracts from 1 Jan 2030. Results announced 29 Jul 2026: 995 MW of solar and about 100 MW of batteries — 270 MW solar with 100 MW storage at COP 315.87/kWh on the first day, 725 MW solar-only on the second. Winners were not named immediately.",
    },
    procedureType: "Subasta de Contratos de Largo Plazo (Resolución MinEnergía 40208 de 2026)",
    scopeType: "works",
    status: "awarded",
    publicationDate: "2026-04-21T12:00:00-05:00",
    awardDate: "2026-07-29T12:00:00-05:00",
    internationalOpen: false,
    sourceUrl: "https://www.bolsamercantil.com.co/subastasdelargoplazo",
    sources: [
      "https://www.bolsamercantil.com.co/subastasdelargoplazo",
      "https://minenergia.gov.co/es/sala-de-prensa/noticias-index/minenergia-lanzo-la-subasta-de-energias-limpias-y-almacenamiento-acelerando-la-transicion-en-el-pais/",
      "https://www.pv-magazine.com/2026/07/31/colombia-awards-725-mw-of-solar-on-second-day-of-green-energy-auction/",
      "https://www.enerdata.net/publications/daily-energy-news/colombia-awards-1-gw-solar-capacity-and-100-mw-bess-latest-auction.html",
    ],
  },
  {
    slug: "energia-dominicana-edes-lp-ngr-01-2025",
    tenderNumber: "EDES-LP-NGR-01-2025",
    country: "Dominican Republic",
    buyer: "Edenorte, Edesur y Edeeste — Consejo Unificado de las Empresas Distribuidoras (CUED)",
    title: {
      zh: "多米尼加 600 MW 新能源+储能长期购电招标（EDES-LP-NGR-01-2025，已签约 325.69 MW）",
      es: "Licitación Pública para Nueva Generación Renovable de hasta 600 MW con almacenamiento, EDES-LP-NGR-01-2025 — adjudicada",
      en: "Dominican Republic 600 MW renewables-plus-storage long-term PPA tender, EDES-LP-NGR-01-2025 — awarded",
    },
    summary: {
      zh: "多米尼加三家国有配电公司（Edenorte、Edesur、Edeeste）通过配电公司统一委员会（CUED）组织、电力监管局（SIE）监督的长期购电招标，仅限新建「光伏+储能」或「风电+储能」项目，单个项目 20–300 MW，总规模最高 600 MW，合同期 180 个月，签约后 24 个月内开始供电。2025 年 8 月 14 日发布，2026 年 2 月 20 日接收报价，4 月 8 日开启 20 份经济报价，共 32 家企业参与。2026 年 6 月 CUED 公布签约结果：共 325.69 MW，配 50% 电池储能，电价约 0.1060–0.1090 美元/千瓦时；签约方为 Parque Taíno（84.70 MW）、Galileo Energía 的 Batoncillo 光伏（44.20 MW）、Mella Solar Power（99.00 MW）、EGE Haina 的 Esperanza 风电（49.50 MW）和 Esperanza 光伏（48.28 MW），预计 2028 年 6 月起并网。投标方须为在多米尼加设立的企业；中国光伏组件、储能设备厂商和 EPC 可通过为中标项目供货或承建参与。",
      es: "Licitación de las distribuidoras Edenorte, Edesur y Edeeste, dirigida por el Consejo Unificado de las Empresas Distribuidoras (CUED) bajo supervisión de la Superintendencia de Electricidad, para contratos de largo plazo con nueva generación eólica o solar fotovoltaica con almacenamiento, de 20 a 300 MW por proyecto y hasta 600 MW en total; contratos de 180 meses con inicio dentro de 24 meses desde la firma. Aviso del 14 de agosto de 2025; recepción de ofertas el 20 de febrero de 2026; apertura de 20 ofertas económicas el 8 de abril de 2026, con 32 empresas participantes. En junio de 2026 el CUED suscribió contratos por 325,69 MW con respaldo del 50 % en baterías, a precios de entre 0,1060 y 0,1090 US$/kWh: Parque Taíno (84,70 MW), Galileo Energía — Parque Solar Batoncillo (44,20 MW), Mella Solar Power (99,00 MW) y EGE Haina — Esperanza Eólico (49,50 MW) y Esperanza Solar (48,28 MW). Entrada prevista a partir de junio de 2028.",
      en: "A long-term PPA tender by the distribution companies Edenorte, Edesur and Edeeste, run by their Unified Council (CUED) under the Electricity Superintendency's supervision, for new wind or solar PV generation with storage, 20–300 MW per project and up to 600 MW in all; 180-month contracts starting within 24 months of signing. Notice of 14 Aug 2025; offers received 20 Feb 2026; 20 economic offers opened 8 Apr 2026, with 32 companies taking part. In June 2026 CUED signed contracts for 325.69 MW with 50% battery backing at US$0.1060–0.1090/kWh: Parque Taíno (84.70 MW), Galileo Energía's Batoncillo solar (44.20 MW), Mella Solar Power (99.00 MW) and EGE Haina's Esperanza wind (49.50 MW) and Esperanza solar (48.28 MW). Entry into service expected from June 2028.",
    },
    procedureType: "Licitación Pública para Nueva Generación Renovable mediante Contratos de Largo Plazo (Ley General de Electricidad 125-01, art. 110; Resolución SIE-092-2025-LCE)",
    scopeType: "works",
    status: "awarded",
    publicationDate: "2025-08-14T12:00:00-04:00",
    submissionDeadline: "2026-02-20T10:00:00-04:00",
    // The date CUED announced the signed contracts; the award resolution
    // itself is not published.
    awardDate: "2026-06-24T12:00:00-04:00",
    internationalOpen: false,
    sourceUrl: "https://edenorte.com.do/aviso-licitacion-publica-no-edes-lp-ngr-01-2025/",
    sources: [
      "https://edenorte.com.do/aviso-licitacion-publica-no-edes-lp-ngr-01-2025/",
      "https://cued.gob.do/cued-da-apertura-de-ofertas-economicas-en-licitacion-de-generacion-de-hasta-600-mw-de-energia-renovable/",
      "https://cued.gob.do/cued-marca-un-hito-al-adjudicar-325-69-mw-de-nueva-capacidad-de-energia-renovable-con-un-respaldo-del-50-en-baterias/",
      "https://compraenergia.do/",
    ],
  },
  {
    slug: "energia-dominicana-edes-lpi-ng-04-2023",
    tenderNumber: "EDES-LPI-NG-04-2023",
    country: "Dominican Republic",
    buyer: "Edenorte, Edesur y Edeeste — Consejo Unificado de las Empresas Distribuidoras (CUED)",
    title: {
      zh: "多米尼加 800 MW 新建发电长期购电国际招标（EDES-LPI-NG-04-2023，已授标）",
      es: "Licitación Pública Internacional para Nueva Generación de hasta 800 MW, EDES-LPI-NG-04-2023 — adjudicada",
      en: "Dominican Republic 800 MW new-generation long-term PPA international tender, EDES-LPI-NG-04-2023 — awarded",
    },
    summary: {
      zh: "多米尼加三家国有配电公司（Edenorte、Edesur、Edeeste）通过配电公司统一委员会（CUED）组织的国际招标，为新建发电机组签订长期购电合同，总规模最高 800 MW；招标条件由电力监管局 SIE-120-2023-LCE 号决议（2023 年 10 月 27 日）确定，2023 年 11 月 1 日开放注册。2024 年 6 月 11 日招标委员会第 06-2024 号决议授标两家：NexGen Capital（机组净容量 467 MW，合同 400 MW，容量电价 35.5 美元/千瓦·月，比较电价约 0.140 美元/千瓦时）和 Energía 2000（机组 440 MW，合同 400 MW，27.77 美元/千瓦·月，约 0.122 美元/千瓦时），两份报价的热耗率为 6.307 和 6.135 MMBtu/MWh。可作为了解多米尼加新建大型电站规模与电价的参考。",
      es: "Licitación internacional de las distribuidoras Edenorte, Edesur y Edeeste, representadas por el Consejo Unificado (CUED), para contratos de largo plazo con nueva generación de hasta 800 MW; bases establecidas por la Resolución SIE-120-2023-LCE del 27 de octubre de 2023, registro abierto desde el 1 de noviembre de 2023. Adjudicada mediante el Acta 06-2024 del Comité de Licitación del 11 de junio de 2024 a NexGen Capital (467 MW netos, 400 MW ofertados, 35,5 US$/kW-mes, precio comparativo de energía 0,139969 US$/kWh) y Energía 2000 (440 MW netos, 400 MW ofertados, 27,77 US$/kW-mes, 0,121975 US$/kWh), con consumos térmicos de referencia de 6,307 y 6,135 MMBtu/MWh.",
      en: "An international tender by the distribution companies Edenorte, Edesur and Edeeste, represented by their Unified Council (CUED), for long-term contracts with up to 800 MW of new generation; bases set by Electricity Superintendency Resolution SIE-120-2023-LCE of 27 Oct 2023, registration open from 1 Nov 2023. Awarded by the tender committee's Act 06-2024 of 11 Jun 2024 to NexGen Capital (467 MW net, 400 MW offered, US$35.5/kW-month, comparative energy price US$0.139969/kWh) and Energía 2000 (440 MW net, 400 MW offered, US$27.77/kW-month, US$0.121975/kWh), with reference heat rates of 6.307 and 6.135 MMBtu/MWh.",
    },
    procedureType: "Licitación Pública Internacional para Nueva Generación mediante Contratos de Largo Plazo (Resolución SIE-120-2023-LCE)",
    scopeType: "works",
    status: "awarded",
    // Bases approved by SIE on 27 October 2023; registration opened 1 November.
    publicationDate: "2023-10-27T12:00:00-04:00",
    awardDate: "2024-06-11T12:00:00-04:00",
    internationalOpen: true,
    sourceUrl: "https://edeeste.com.do/index.php/resultado-proceso-de-adjudicacion-edes-lpi-ng-04-2023/",
    sources: [
      "https://edeeste.com.do/index.php/resultado-proceso-de-adjudicacion-edes-lpi-ng-04-2023/",
      "https://edeeste.com.do/wp-content/uploads/Resultado-Adjudicacion-EDES-LPI-NG-04-2023.pdf",
      "https://compraenergia.do/",
    ],
  },
];

function iso(raw: string | undefined): string | undefined {
  return raw ? new Date(raw).toISOString() : undefined;
}

export function energyAuctionToTender(auction: EnergyAuction, now: Date = new Date()): Tender {
  const publicationDate = iso(auction.publicationDate)!;
  const submissionDeadline = iso(auction.submissionDeadline);
  const awardDate = iso(auction.awardDate);
  const keyDates: TenderKeyDate[] = [{ id: `${auction.slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${auction.slug}-submission`, type: "submission", date: submissionDeadline });
  if (awardDate) keyDates.push({ id: `${auction.slug}-award`, type: "award", date: awardDate });
  const { industries, relevance } = classifyEnergyAuction();
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug: auction.slug,
    tenderNumber: auction.tenderNumber,
    title: auction.title,
    summary: auction.summary,
    buyer: auction.buyer,
    country: auction.country,
    governmentLevel: "federal",
    industries,
    scopeType: auction.scopeType,
    procedureType: auction.procedureType,
    ...(auction.internationalOpen ? { participationScope: "international_open" as const } : {}),
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(awardDate ? { awardDate } : {}),
    status: auction.status,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: ENERGY_AUCTIONS_SOURCE_NAME,
    sourceUrl: auction.sourceUrl,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
