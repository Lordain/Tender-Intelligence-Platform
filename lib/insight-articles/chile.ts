import type { InsightArticle } from "@/lib/insight-articles/types";

export const chileInsight: InsightArticle = {
  slug: "chile",
  countryEn: "Chile",
  countryPath: "/countries/chile",
  kicker: "Infrastructure & procurement outlook",
  headline: ["智利国家洞察：", "2025—2055基础设施规划与近期项目机会"],
  lede: "从长期规划看方向，再按项目阶段、采购主体和正式标书，找到真正能投的机会。资料核对截至2026年9月25日。",
  published: "2026-09-25",
  modified: "2026-10-05",
  stats: [
    { label: "长期规划估算", value: "417万亿", unit: "智利比索", usd: "约4,318亿美元", note: "PNIP 2025—2055滚动组合" },
    { label: "规划倡议", value: "24,589", unit: "项", note: "截至2026年1月" },
    { label: "核心方向", value: "4", unit: "大领域", note: "能源、交通、城市与水务" },
    { label: "矿业投资储备", value: "1,045.49亿", unit: "美元", note: "Cochilco 2025—2034组合" },
  ],
  basis: "417万亿比索和24,589项倡议是横跨2025—2055年的滚动规划，含公共与私人项目，不是2026年预算，也不是招标数量。Cochilco矿业储备是另一套统计，不能与PNIP相加。",
  overview: {
    title: "从30年规划到真正可跟踪的项目",
    points: [
      { lead: "一张30年的总图", text: "MOP的PNIP把交通与区域连接、城市宜居、水资源和能源安全放进同一框架，并持续滚动调整。" },
      { lead: "不是投标日历", text: "组合里有公共工程，也有其他部委、公共企业和私人项目；PNIP、DGC特许经营、Mercado Público和矿业／电力业主采购要分开管理。" },
      { lead: "进入采购才算机会", text: "看可研、环评、融资和采购文件是否完成，主管机构是否已发正式公告。" },
    ],
  },
  sectors: {
    title: "资金主要投向：能源与连接能力居前",
    intro: "PNIP官网四个领域的约数（截至2026年1月），是长期规划规模，不是年度预算或可相加的招标金额。",
    bars: [
      { name: "能源安全", value: 173, tag: "约1,791亿美元", amount: "约173万亿智利比索", color: "bg-[#c85c43]" },
      { name: "区域连接与交通", value: 150, tag: "约1,553亿美元", amount: "约150万亿智利比索", color: "bg-[#d9a23a]" },
      { name: "城市与公共服务", value: 49, tag: "约507亿美元", amount: "约49万亿智利比索", color: "bg-[#59a8d8]" },
      { name: "水资源安全", value: 45, tag: "约466亿美元", amount: "约45万亿智利比索", color: "bg-[#6eab9a]" },
    ],
    takeaways: [
      { lead: "能源安全", text: "发电、储能、输电和配网等长期系统需求。" },
      { lead: "区域连接与交通", text: "公路、铁路、港口、机场与跨区域物流。" },
      { lead: "城市与水资源", text: "城市更新、公共设施、医疗社区服务，以及供水、污水、蓄水和输水。" },
    ],
  },
  pipeline: {
    title: "值得持续跟踪的五类项目方向",
    items: [
      { icon: "energy", title: "电网、储能与清洁能源", text: "北部新能源和矿业负荷、中部扩容、跨区输电带来持续需求；能源部2026—2030路线图强调战略输电规划。" },
      { icon: "road", title: "公路、机场与特许经营", text: "DGC持续发布公路、机场和社会基础设施特许经营组合，项目分处构想、招标、授标、建设或运营阶段。" },
      { icon: "mine", title: "铜矿与锂项目的配套", figure: "1,045.49亿美元矿业储备", text: "Cochilco 2025—2034估算，是不同成熟度的矿业投资，不是政府采购；输电、海淡、管线、道路和营地值得逐项目拆解。" },
      { icon: "water", title: "水务与海水淡化", text: "城乡供水、污水、蓄水、灌溉和抗旱；北部矿业和沿海城市带来海淡与长距离输水，水权、环评和能源成本要先核验。" },
      { icon: "port", title: "港口物流与数字连接", text: "港口之外看集疏运、公路铁路接口、仓储和供能；光纤、5G、数据中心和政府数字化的采购主体可能完全不同。" },
    ],
  },
  regions: {
    title: "四类区域，采购与履约条件不同",
    map: {
      src: "/insights/chile-infrastructure-regions.webp",
      width: 1600,
      height: 900,
      alt: "智利四类基础设施机会区域示意图：北部矿业与能源带、中部都市与港口枢纽、中南部工业与农业走廊、南部与极地连接区",
      caption: "根据官方规划与行业管线整理的业务观察区，不代表行政边界、项目准确位置或投资范围。",
    },
    items: [
      { color: "bg-[#d9a23a]", title: "北部矿业与能源带", places: "Arica y Parinacota、Tarapacá、Antofagasta、Atacama", focus: "铜锂项目、光伏储能、矿区供水与海淡、输电、公路和港口集疏运；重点核对环评、偏远施工和水资源约束。" },
      { color: "bg-[#59a8d8]", title: "中部都市与港口枢纽", places: "Coquimbo、Valparaíso、Metropolitana、O’Higgins", focus: "都市公路、轨道公交、港口物流、机场、公共建筑、城市水务与电网；采购机构、特许经营公司和地方政府并行。" },
      { color: "bg-[#c85c43]", title: "中南部工业与农业走廊", places: "Maule、Ñuble、Biobío、La Araucanía", focus: "干线公路、铁路货运、林农物流、工业供能、灌溉与灾害韧性；关注区域工程和长期运维标段。" },
      { color: "bg-[#7b63a8]", title: "南部与极地连接区", places: "Los Ríos、Los Lagos、Aysén、Magallanes", focus: "跨区交通、机场港口、偏远电力、光纤、供水和公共服务；项目分散，物流和气候影响成本。" },
    ],
    note: "智利南北跨度大，海拔、气候、用水和港口距离会直接改变报价和售后成本。不要只看项目标题判断是否适合进入。",
  },
  opportunities: {
    title: "中国企业可关注的潜在项目机会",
    intro: "特许经营总包之外，设备供货、专项工程、数字系统和长期维护也会形成合同；是否接受境外企业以项目文件为准。",
    items: [
      { sector: "电力与储能", scope: ["输电线路", "变电站", "储能系统", "保护控制", "配网设备", "运维"], buyers: "能源部、CNE、Coordinador Eléctrico、发电及输电公司" },
      { sector: "交通与工程", scope: ["公路桥梁", "轨道", "机场设施", "施工设备", "智能交通", "维护"], buyers: "MOP、DGC、交通主管机构、特许经营公司" },
      { sector: "水务与海淡", scope: ["海水淡化", "泵站", "输水管线", "污水处理", "节水", "监测"], buyers: "MOP水务系统、地方公用事业、矿业及工业项目业主" },
      { sector: "矿业配套", scope: ["矿山工程", "选矿", "供电供水", "自动化", "环保设备", "备件"], buyers: "矿业公司、ENAMI、EPC总包与运营商" },
      { sector: "港口与物流", scope: ["码头", "装卸", "仓储", "冷链", "集疏运", "数字化调度"], buyers: "港口企业、运营商、DGC及物流项目公司" },
      { sector: "ICT与公共服务", scope: ["光纤", "数据中心", "网络安全", "医院设备", "信息系统"], buyers: "ChileCompra采购机构、通信企业、医院及项目公司" },
    ],
  },
  entry: {
    title: "把规划方向转成参标动作",
    steps: [
      { title: "区分入口", detail: "货物服务看Mercado Público，特许经营看DGC，矿业电力港口业主可能用自有系统。" },
      { title: "核对项目阶段", detail: "把规划、许可、预算、公告、投标、授标和建设逐项标注。" },
      { title: "先读完整标书", detail: "境外资格、技术标准、担保、交货、税费、评标权重和问答更正。" },
      { title: "建本地履约方案", detail: "认证、代表、仓储、安装、售后和运维，以及与本地承包商合作的边界。" },
    ],
    guides: [
      { href: "/guides/chile-mercado-publico", label: "查看Mercado Público参标指南" },
      { href: "/guides/chile-codelco", label: "查看Codelco参标指南" },
    ],
  },
  sources: {
    intro: "依据截至2026年9月25日可核对的官方资料：PNIP数据更新至2026年1月，矿业数据采用Cochilco 2025—2034组合。规划、矿业储备、特许经营与公开采购有交叉，不能相加。",
    items: [
      { label: "MOP：国家公共基础设施规划2025—2055", href: "https://infraestructura2055.mop.gob.cl/", note: "截至2026年1月的417万亿比索与24,589项倡议；四大方向。" },
      { label: "MOP：PNIP文件与口径说明", href: "https://infraestructura2055.mop.gob.cl/descargas/", note: "规划文件、组合来源和2026年1月更新说明。" },
      { label: "DGC：特许经营项目组合", href: "https://concesiones.mop.gob.cl/tipo/cartera-de-proyectos/", note: "按项目核对阶段、预估投资和采购主体。" },
      { label: "DGC：季度报告与招标组合", href: "https://concesiones.mop.gob.cl/publicaciones/", note: "区分待招、正在招标、授标与建设。" },
      { label: "能源部：2026—2030能源路线图", href: "https://energia.gob.cl/sites/default/files/documentos/ruta_2026-2030.pdf", note: "输电规划、战略电网和项目推进方向。" },
      { label: "Cochilco：2025—2034矿业投资项目组合", href: "https://www.cochilco.cl/web/informe-cartera-de-proyectos-de-inversion-minera-2025-2034/", note: "1,045.49亿美元矿业投资储备；不是公共采购预算。" },
      { label: "ChileCompra：Mercado Público", href: "https://www.chilecompra.cl/mercado-publico/", note: "公共采购的公开查询及交易平台。" },
      { label: "智利央行：观察美元参考汇率", href: "https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TIPO_CAMBIO/MN_TIPO_CAMBIO4/DOLAR_OBS_ADO?idSerie=F073.TCO.PRE.Z.D", note: "2026年9月25日：1美元＝965.71智利比索。" },
    ],
    fx: "按智利央行2026年9月25日观察美元1美元＝965.71智利比索估算，取整至亿美元；仅作规模参考，不是历史投资的实际汇率。",
  },
};
