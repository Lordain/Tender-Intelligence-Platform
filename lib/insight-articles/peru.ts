import type { InsightArticle } from "@/lib/insight-articles/types";

export const peruInsight: InsightArticle = {
  slug: "peru",
  countryEn: "Peru",
  countryPath: "/countries/peru",
  kicker: "Competitiveness & logistics outlook",
  headline: ["秘鲁国家洞察：", "2024—2030竞争力规划与物流走廊机会"],
  lede: "从2024—2030竞争力规划、2032物流走廊和2026项目组合出发，看交通、矿业、能源、水务与社会基础设施里能执行的机会。",
  published: "2026-09-17",
  modified: "2026-10-10",
  stats: [
    { label: "2026公共预算", value: "约765.2亿", unit: "美元", detail: "原币2,575.62亿秘鲁索尔", note: "中央、区域和地方合计" },
    { label: "APP与资产项目", value: "44+8", unit: "个项目与增补合同", detail: "目标约197.97亿美元", note: "PROINVERSIÓN 2026年组合" },
    { label: "矿业投资储备", value: "66", unit: "个矿业项目", detail: "合计约640.75亿美元", note: "分布于全国19个大区" },
    { label: "国家物流网络", value: "41", unit: "条物流走廊", note: "2032国家运输物流规划" },
  ],
  basis: "秘鲁没有覆盖全部行业的单一“总盘子”：本文用2024—2030竞争力规划、2032物流规划、2026预算和主管机构项目组合。政局变动会影响节奏，以已立法、已签约或已列入正式组合的事项为准。",
  overview: {
    title: "稳定的主线来自制度、合同与长期物流规划",
    points: [
      { lead: "竞争力规划是改革路线图", text: "75项措施、37个公共机构参与，覆盖基础设施、人才、贸易、融资和数字化，不是可相加的工程预算。" },
      { lead: "PNISC 2022—2025是基线", text: "72个优先项目、1,466.22亿索尔（约435.6亿美元）；规划期结束后，在建和特许经营中的项目仍在推进。" },
      { lead: "预算之外还有三条通道", text: "公共采购之外，还要跟踪APP、Proyectos en Activos和Obras por Impuestos，大型基础设施不只走财政预算。" },
    ],
  },
  sectors: {
    title: "2026年APP组合：能源矿业、水务和交通居前",
    intro: "PROINVERSIÓN计划推动44个项目和8项合同增补，目标197.97亿美元。下列为官方单独披露的行业金额，不是占全部组合的百分比。",
    bars: [
      { name: "能源与矿业", value: 30.59, tag: "19个项目", amount: "30.59亿美元", color: "bg-[#c85c43]" },
      { name: "水务与卫生", value: 25.51, tag: "6个项目", amount: "25.51亿美元", color: "bg-[#59a8d8]" },
      { name: "交通", value: 15.18, tag: "8个项目", amount: "15.18亿美元", color: "bg-[#d9a23a]" },
      { name: "医疗", value: 14.08, tag: "4个项目", amount: "14.08亿美元", color: "bg-[#7b63a8]" },
      { name: "教育", value: 7.47, tag: "2个项目", amount: "7.47亿美元", color: "bg-[#8dc9e8]" },
    ],
    takeaways: [
      { lead: "港口不再是孤立资产", text: "Chancay、Callao和区域港口正与公路、铁路、仓储、园区和海关能力组合出现。" },
      { lead: "矿业带动第二层采购", text: "输电、供水、道路、营地、环保和自动化，更适合专业供应商提前进入。" },
      { lead: "建设与长期服务并重", text: "APP越来越看运营绩效，设备维护、设施管理和数字监测形成多年需求。" },
    ],
  },
  pipeline: {
    title: "已经能看到的七个工程方向",
    items: [
      { icon: "port", title: "港口、机场与物流走廊", figure: "41条物流走廊", text: "2032规划把公路、铁路、港口、机场和水运当一个系统；Callao、Chancay、Paita、Matarani、Ilo周边的集疏运和仓储值得一起跟踪。" },
      { icon: "rail", title: "城市轨道、铁路与公路", text: "MTC组合含Lima地铁、Anillo Vial Periférico、Huancayo—Huancavelica铁路、区域机场和干线公路；多走特许经营、APP或增补合同。" },
      { icon: "mine", title: "矿业项目与配套", figure: "66个项目 · 640.75亿美元", text: "MINEM 2026组合覆盖19个大区；拉动矿山工程、电力、输水、营地、运输、自动化和备件服务。" },
      { icon: "energy", title: "输电、新能源与矿区供能", text: "新增负荷来自矿山、港口和工业项目；输电、变电站、光伏、储能、微网和运维，许可与并网要逐项核验。" },
      { icon: "water", title: "水务、污水与灌溉", figure: "6个项目 · 25.51亿美元", text: "PROINVERSIÓN 2026组合；沿海缺水城市、矿区和灌溉区可能出现海淡、供水、污水和管网项目。" },
      { icon: "health", title: "医疗与教育设施", figure: "医疗14.08亿 · 教育7.47亿美元", text: "4个医疗、2个教育APP项目，涉及Lima、Piura和Cusco等地；常含设备、设施管理和长期服务绩效。" },
      { icon: "digital", title: "数字化与投资管理", text: "竞争力规划推动公共投资数字化、BIM和项目准备能力；机会多在咨询、设计软件、数据平台和项目管理合同。" },
    ],
  },
  regions: {
    title: "四类区域，形成不同的采购组合",
    map: {
      src: "/insights/peru-regions.svg",
      width: 1600,
      height: 1000,
      alt: "秘鲁重点区域地图，按省级行政区着色：1 北部资源与物流带、2 Lima—Callao与中部枢纽、3 南部矿业能源走廊、4 亚马孙与东部连接区",
      caption: "按省级行政区着色，编号对应下方区域卡片，图标为该区域的重点方向；仅示意，不代表具体项目选线或投资金额的地域分布。",
    },
    items: [
      { color: "bg-[#d9a23a]", title: "北部资源与物流带", places: "Tumbes、Piura、Lambayeque、La Libertad、Cajamarca、Áncash", focus: "矿业、农业出口、公路、Paita港、区域机场、水务和灌溉；Cajamarca是矿业重点，沿海偏港口物流和城市服务。" },
      { color: "bg-[#59a8d8]", title: "Lima—Callao与中部枢纽", places: "Lima、Callao、Junín、Pasco、Huánuco、Ica、Huancavelica、Ayacucho", focus: "Lima地铁、外围环路、Callao港与机场、中部铁路、医疗和水务；体量大，竞争、许可和城市施工也更复杂。" },
      { color: "bg-[#c85c43]", title: "南部矿业能源走廊", places: "Arequipa、Apurímac、Cusco、Moquegua、Tacna、Puno", focus: "铜矿及扩建、矿区供电输水、公路铁路、Matarani和Ilo港；社会许可、社区关系和高海拔施工能力至关重要。" },
      { color: "bg-[#7b63a8]", title: "亚马孙与东部连接区", places: "Loreto、Ucayali、San Martín、Amazonas、Madre de Dios", focus: "河运码头、Hidrovía Amazónica、数字连接、离网能源、水务和公共服务；合同分散，物流和运维要求更高。" },
    ],
    note: "项目所在大区直接影响物流、高海拔施工、社区关系、水资源和售后覆盖。把区域履约条件和技术条件放在同一张成本表里。",
  },
  opportunities: {
    title: "中国企业可以从哪些位置进入？",
    intro: "大型特许经营权不是唯一选择。设备供货、专项工程、EPC分包、设计、运维和当地联合履约更适合作为第一步。",
    items: [
      { sector: "交通与大型工程", scope: ["公路桥隧", "轨道", "站场", "机场", "收费与智能交通", "施工设备"], buyers: "MTC、PROVÍAS、PROINVERSIÓN、特许经营公司" },
      { sector: "矿业供应链", scope: ["矿山工程", "选矿", "输水供电", "输送", "自动化", "环保", "备件与维护"], buyers: "矿业项目业主、EPC承包商和矿区服务公司" },
      { sector: "港口与物流", scope: ["码头", "疏浚", "装卸", "仓储", "冷链", "海关设施", "集疏运"], buyers: "APN、港口运营商、物流园区及地方项目主体" },
      { sector: "电力与新能源", scope: ["输变电", "光伏", "储能", "微网", "保护控制", "工程及运维"], buyers: "MINEM、COES、配电企业和项目开发商" },
      { sector: "水务与灌溉", scope: ["海水淡化", "供排水", "污水处理", "输水", "泵站", "智慧水务"], buyers: "住房部、地方政府、公用事业公司及农业主管机构" },
      { sector: "医疗与教育", scope: ["医院学校建设", "医疗设备", "设施管理", "维护", "数字化服务"], buyers: "卫生部、教育部、EsSalud、区域政府及APP项目公司" },
    ],
  },
  entry: {
    title: "把国家方向变成可执行动作",
    steps: [
      { title: "分清采购机制", detail: "公共采购、APP、Proyectos en Activos和Obras por Impuestos的主体、回报和风险完全不同。" },
      { title: "拆开项目阶段", detail: "规划、预投资、可研、结构化、招标、建设和运营，各有不同客户与动作。" },
      { title: "画主体与承包链", detail: "OECE/SEACE之外，还有MEF、PROINVERSIÓN、MTC、MINEM、区域政府和EPC。" },
      { title: "提前办RNP与本地履约", detail: "境外企业RNP登记、授权代表、西语文件、担保、税务和当地分支。" },
      { title: "政局变化就重核节点", detail: "人事变动后重新确认预算、主管机构、合同、许可和时间表。" },
    ],
    guides: [
      { href: "/guides/peru-seace-oece", label: "查看秘鲁SEACE参标指南" },
      { href: "/guides/peru-obras-por-impuestos", label: "查看Obras por Impuestos指南" },
    ],
  },
  sources: {
    intro: "优先采用MEF、CNCF、PROINVERSIÓN、MTC、MINEM及SBS公开资料。规划、预算、交易组合和行业储备的范围有重叠，不能相加。",
    items: [
      { label: "CNCF：国家竞争力与生产力计划2024—2030", href: "https://www.cnc.gob.pe/plan-de-competitividad/plan-de-competitividad", note: "75项措施、37个责任机构及至2030年7月的节点。" },
      { label: "MEF：国家可持续基础设施计划2022—2025", href: "https://www.mef.gob.pe/es/inversion-privada-sp-21801/6082-plan-nacional-de-infraestructura-sostenible-para-la-competitividad-2022-2025", note: "72个优先项目、1,466.22亿索尔及十个领域。" },
      { label: "MEF：2026公共预算", href: "https://www.gob.pe/institucion/mef/noticias/1299969-presupuesto-publico-2026-es-aprobado-tras-consenso-entre-gobierno-y-congreso-para-fortalecer-obras-y-servicios-esenciales", note: "2,575.62亿索尔预算总额，其中中央政府1,642.23亿、区域政府591.64亿；地方政府额度以MEF预算文件为准（通稿三级分项与总额不闭合）。" },
      { label: "MEF：2026预算投资说明", href: "https://www.gob.pe/institucion/mef/noticias/1240904-titular-del-mef-propuesta-de-presupuesto-publico-2026-permitira-al-peru-mantener-el-camino-de-desarrollo-y-cierre-de-brechas", note: "2026年投资安排、续建比例及部门重点。" },
      { label: "PROINVERSIÓN：2026 APP与资产项目组合", href: "https://www.gob.pe/institucion/proinversion/noticias/1363835-proinversion-impulsa-cartera-de-44-proyectos-y-8-adendas-por-cerca-de-us-20-mil-millones-para-el-2026", note: "44个项目、8项增补合同、197.97亿美元及行业分布。" },
      { label: "MTC：2032国家运输物流规划", href: "https://www.gob.pe/institucion/mtc/normas-legales/4081616-362-2023-mtc-01", note: "已批准的2032物流服务与基础设施规划。" },
      { label: "MTC：41条物流走廊及基础设施缺口", href: "https://www.gob.pe/institucion/mtc/noticias/1404135-mtc-expone-cartera-de-proyectos-multimodales-para-impulsar-la-competitividad-nacional", note: "41条走廊、超过920亿索尔（约273.3亿美元）的交通物流缺口。" },
      { label: "MINEM：2026矿业投资项目组合", href: "https://www.gob.pe/institucion/minem/noticias/1415102-minem-publica-cartera-de-proyectos-de-inversion-minera-2026-que-representa-inversiones-superiores-a-us-64-mil-millones", note: "66个项目、19个大区及640.75亿美元。" },
      { label: "SBS：官方会计汇率", href: "https://www.sbs.gob.pe/app/pp/SISTIP_PORTAL/Paginas/Publicacion/TipoCambioContable.aspx", note: "2026年9月16日：1美元＝3.3660秘鲁索尔。" },
    ],
    fx: "按2026年9月16日SBS会计汇率1美元＝3.3660秘鲁索尔换算，仅用于理解量级，不构成报价或财务依据。",
    caution: "秘鲁总统、内阁和部门负责人更替较频繁，可能影响项目优先级和执行速度。已签合同、已获预算、已进入采购或有多年度法律依据的项目，通常比单次政策宣布更可跟踪。",
  },
};
