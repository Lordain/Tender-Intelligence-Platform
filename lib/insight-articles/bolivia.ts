import type { InsightArticle } from "./types";

/**
 * Bolivia, written to lib/insight-articles/README.md (user, 2026-10-10: 你也把
 * 玻利维亚做了). Bolivia publishes no multi-year, all-sector investment total,
 * so the page is built from what is published and sourced: the reformulated
 * 2026 budget, the multilateral banks' commitments and the state companies'
 * own plans — each on its own basis, never added together.
 */
export const boliviaInsight: InsightArticle = {
  slug: "bolivia",
  countryEn: "Bolivia",
  countryPath: "/countries/bolivia",
  kicker: "Reform & financing outlook",
  headline: ["玻利维亚国家洞察：", "2026—2028改革期融资与基础设施机会"],
  lede: "新政府重编预算、放开汇率、收紧直接采购，多边银行资金随之进场。道路、电力、灌溉和油气是最先落地的方向，但融资承诺不等于在招合同。",
  published: "2026-10-10",
  modified: "2026-10-10",
  stats: [
    { label: "2026公共投资预算", value: "29.56亿", unit: "美元", detail: "原文即美元口径", note: "重编预算方案列示，不是已开标金额" },
    { label: "美洲开发银行支持", value: "45亿", unit: "美元", detail: "原币即美元", note: "2026—2028可支付总额，含稳定计划与私营部门" },
    { label: "世界银行在执行项目", value: "约6.75亿", unit: "美元", detail: "原币即美元，3个项目合计", note: "农村电气化、社区灌溉与农村联盟" },
    { label: "YPFB油气投资计划", value: "6.01亿", unit: "美元", detail: "原币即美元", note: "YPFB、子公司与作业公司2026年合计" },
  ],
  basis: "玻利维亚没有覆盖全部行业的多年投资总盘子：本文分别列示2026年重编预算、多边银行承诺和国企投资计划，口径不同，不相加。2026年1月起汇率放开，按玻利维亚诺列示的金额折算美元只作量级参考。",
  overview: {
    title: "改革中的投资窗口：先看钱从哪里来",
    points: [
      { lead: "新政府2025年11月8日就任", text: "Rodrigo Paz政府推动财政整顿；玻利维亚央行2026年1月起放开汇率，10月9日官方汇率为1美元＝11.85玻利维亚诺。" },
      { lead: "2026预算7月30日颁布", text: "重编后总额3,918.16亿玻利维亚诺；剔除约48亿玻利维亚诺缺少技术文件或土地权属、无法执行的投资项目。" },
      { lead: "直接采购通道收紧", text: "4月6日第5600号最高法令废除161项授权直接采购的法令，减少绕开公开招标的途径。" },
    ],
  },
  sectors: {
    title: "已公开的资金盘子：口径不同，不能相加",
    intro: "以下为各机构公开的资金承诺或年度计划，统一按亿美元列示；玻利维亚诺金额按文末汇率折算。不是行业预算，也不代表已开标。",
    bars: [
      { name: "美洲开发银行支持", value: 45, amount: "45亿美元", tag: "2026—2028", color: "bg-[#59a8d8]" },
      { name: "拉美开发银行（CAF）计划", value: 31, amount: "约31亿美元", tag: "五年", color: "bg-[#7b63a8]" },
      { name: "拉巴斯省道路等工程", value: 14.3, amount: "约14.3亿美元", tag: "总统公布", color: "bg-[#c85c43]" },
      { name: "世界银行在执行项目", value: 6.75, amount: "约6.75亿美元", tag: "3个项目", color: "bg-[#548c58]" },
      { name: "YPFB油气投资", value: 6.01, amount: "6.01亿美元", tag: "2026年", color: "bg-[#d9a23a]" },
      { name: "生产发展部公共投资", value: 2.3, amount: "约2.3亿美元", tag: "2026年", color: "bg-[#061b2b]" },
      { name: "北部亚马孙电气化", value: 2.04, amount: "2.04亿美元", tag: "美洲开发银行", color: "bg-[#35a6c8]" },
    ],
    takeaways: [
      { lead: "融资先到位", text: "多边银行资金优先流向道路、电力和农业水利，采购常按出资方规则执行。" },
      { lead: "国企是主要买家", text: "油气、电力和锂分别看YPFB、ENDE和YLB的采购计划与合同进展。" },
    ],
  },
  strategy: {
    nav: "改革议程",
    title: "四项改革：影响谁来发包、怎么发包",
    intro: "改革仍在推进，法律和机构可能继续调整；以已颁布的法令和已签署的融资为准。",
    items: [
      { tag: "财政", title: "预算重编", text: "剔除无技术文件的投资项目，削减经常性支出；允许省、市政府追加预算执行工程。" },
      { tag: "采购", title: "收紧直接采购", text: "第5600号最高法令废除161项直接采购授权，减少绕开公开招标的途径。" },
      { tag: "税收", title: "资本品免增值税", text: "重编预算法对投入品、机械设备和资本品的进口与销售免征增值税五年。" },
      { tag: "资源", title: "油气与矿业新法", text: "政府推动油气和矿业法案，采用公私合作的“50-50”模式，特许权使用费留在地方。" },
    ],
  },
  pipeline: {
    title: "项目方向：有融资，不等于已开标",
    items: [
      { icon: "road", title: "拉巴斯省道路与桥梁", figure: "近170亿玻利维亚诺（约14.3亿美元）", text: "总统7月公布，首期至少10亿玻利维亚诺；含Escoma—Charazani、Unduavi—Chulumani、Santa Bárbara—Caranavi等路段，CAF、美洲开发银行和世界银行支持。" },
      { icon: "energy", title: "北部亚马孙电气化", figure: "美洲开发银行2.04亿美元", text: "Pando和Beni并网，减少柴油发电；另有世界银行IDTR III农村电气化1.5亿美元，由ENDE执行至2030年。" },
      { icon: "mine", title: "油气与锂", figure: "YPFB 2026计划6.01亿美元", text: "其中勘探2.82亿、开发1.65亿美元；中国CBC和俄罗斯Uranium One的锂矿合同待新法框架确定。" },
      { icon: "water", title: "社区灌溉与供水", figure: "世界银行1.73亿美元", text: "由生产发展、农村与水务部执行，2030年关闭；拉巴斯Batallas饮水项目列入省级工程计划。" },
      { icon: "industry", title: "生产与农业体系", figure: "生产发展部2026投资约2.3亿美元", text: "世界银行农村联盟PAR III（3.51亿美元）支持农业生产链；资本品免增值税降低设备进口成本。" },
    ],
    note: "金额按各机构公布口径列示；同一项目可能同时出现在国家预算和银行融资里，不能相加。",
  },
  regions: {
    title: "区域机会：高原、谷地、低地与南部",
    map: { src: "/insights/bolivia-regions.svg", width: 1600, height: 1000, alt: "玻利维亚重点区域地图，按省级行政区着色：1 西部高原矿业与都市带、2 中部谷地交通与灌溉带、3 东部低地农业与能源带、4 南部天然气与能源区", caption: "按省级行政区着色，编号对应下方区域卡片，图标为该区域的重点方向；仅示意，不代表具体项目选线或投资金额的地域分布。" },
    items: [
      { color: "bg-[#c85c43]", title: "西部高原矿业与都市带", places: "La Paz、Oruro、Potosí", focus: "道路桥梁、矿业与锂资源、城市交通和供水；拉巴斯省工程计划近170亿玻利维亚诺，高海拔施工和社区协商影响工期。" },
      { color: "bg-[#d9a23a]", title: "中部谷地交通与灌溉带", places: "Cochabamba、Chuquisaca", focus: "东西向公路连接、灌溉与供水和农产品加工；世界银行社区灌溉项目覆盖多地，具体工点以采购公告为准。" },
      { color: "bg-[#59a8d8]", title: "东部低地农业与能源带", places: "Santa Cruz、Beni、Pando", focus: "农业加工与物流、北部亚马孙电气化和道路连接；美洲开发银行2.04亿美元支持Pando和Beni并网。" },
      { color: "bg-[#7b63a8]", title: "南部天然气与能源区", places: "Tarija", focus: "油气勘探开发、输电和供水；政府9月公布约30亿玻利维亚诺的南部工程包，由中央与省、市政府各出一半。" },
    ],
    note: "区域为平台根据公开资料整理的业务观察，不是官方投资分区。地图仅用于说明业务观察区域，不代表精确行政边界、项目位置、投资范围或政治立场。",
  },
  opportunities: {
    title: "企业机会：工程、设备与长期服务",
    intro: "以下为公开资金方向对应的供应链判断；外国企业资格、本地优先和融资采购规则必须逐标核实。",
    items: [
      { sector: "道路与桥梁", scope: ["公路改扩建", "桥梁", "施工设备", "养护"], buyers: "玻利维亚公路管理局（ABC）、省和市政府" },
      { sector: "电力与电气化", scope: ["配电网与并网", "离网与混合发电", "变电与计量"], buyers: "国家电力公司（ENDE）及其子公司" },
      { sector: "油气", scope: ["勘探开发服务", "管线与站场", "炼化与储运设备"], buyers: "国家石油公司（YPFB）、子公司与作业公司" },
      { sector: "灌溉与供水", scope: ["灌渠与小型水利", "泵站管网", "饮水与净水"], buyers: "生产发展、农村与水务部，市政府" },
      { sector: "矿业与锂", scope: ["选冶设备", "能源与供水配套", "工程服务"], buyers: "玻利维亚锂矿公司（YLB）、COMIBOL及合作企业" },
      { sector: "农业与食品体系", scope: ["加工与仓储", "冷链", "农机"], buyers: "农村发展与土地部、生产主体和合作社" },
    ],
  },
  entry: {
    title: "进入路径：资金、登记、担保与本地伙伴",
    steps: [
      { title: "分清资金", detail: "国家预算项目走SICOES和政府采购规则；银行融资项目按出资方采购政策。" },
      { title: "登记RUPE", detail: "在国家供应商统一登记（RUPE）注册，准备公司存续、授权和翻译认证文件。" },
      { title: "备好担保", detail: "外国企业的担保须由玻利维亚境内保险公司或有当地代理行的银行出具。" },
      { title: "找本地伙伴", detail: "工程类招标中本地企业有5%评标优惠；合同允许分包时，外国中标人须分包给可承接的本地企业。" },
      { title: "按文件决策", detail: "核对资格、汇率、付款币种、税费和履约要求后再投入。" },
    ],
    guides: [{ href: "/guides/bolivia-sicoes", label: "查看玻利维亚SICOES参标指南" }],
  },
  sources: {
    intro: "仅引用政府公报、国企与多边银行公开信息及主流媒体报道；未访问需要人机验证的SICOES检索页面。",
    items: [
      { label: "ANF：2026重编预算", href: "https://www.noticiasfides.com/economia/presupuesto-reformulado-preve-incremento-de-bs-7-472-millones-sobre-el-presentado-por-el-gobierno-de-arce", note: "2026年4月29日：总额391,815.8百万玻利维亚诺，较原预算增加7,472.4百万（3.7%）；公共投资2,956百万美元。" },
      { label: "eju.tv：重编预算法颁布", href: "https://eju.tv/?p=5051204", note: "2026年7月30日颁布；省市可追加预算，评估亏损国企，投入品与资本品免增值税五年。" },
      { label: "玻利维亚通讯社（ABI）：重编预算主要调整", href: "https://abi.bo/conozca-cuales-son-las-modificaciones-clave-del-pge-2026-para-reducir-deficit-y-fortalecer-inversion-social/", note: "2026年4月21日：剔除4,800百万玻利维亚诺无法执行的投资项目，赤字目标为GDP的9%。" },
      { label: "ABI：第5600号最高法令", href: "https://abi.bo/gobierno-presenta-el-decreto-5600-que-suprime-161-decretos-y-transparenta-las-contrataciones-directas/", note: "2026年4月6日：废除161项授权直接采购的法令。" },
      { label: "美洲开发银行：45亿美元支持计划", href: "https://www.iadb.org/en/news/idb-group-bolivia-agree-major-45-billion-support-package", note: "2026—2028可支付；细项据《Los Tiempos》2026年1月13日报道：首年约20亿美元稳定计划，IDB Invest三年最多4.5亿美元。" },
      { label: "Bloomberg Línea：CAF融资计划", href: "https://www.bloomberglinea.com/latinoamerica/bolivia/bolivia-asegura-un-plan-de-financiamiento-por-us3100-millones-con-la-caf/", note: "五年约3,100百万美元（官方称已由上限改为下限），项目逐项经CAF董事会审批。" },
      { label: "世界银行：IDTR III农村电气化（P180027）", href: "https://projects.worldbank.org/en/projects-operations/project-detail/P180027", note: "150百万美元，2023年11月批准，ENDE执行，2030年3月关闭。" },
      { label: "世界银行：社区灌溉（P178861）", href: "https://projects.worldbank.org/en/projects-operations/project-detail/P178861", note: "173.4百万美元，2024年2月批准，2030年1月关闭。" },
      { label: "世界银行：农村联盟PAR III（P175672）", href: "https://projects.worldbank.org/en/projects-operations/project-detail/P175672", note: "351.2百万美元，2022年8月批准，2027年11月关闭。" },
      { label: "YPFB：2026油气投资计划", href: "https://www.ypfb.gob.bo/node/521", note: "2026年4月30日：合计600.8百万美元，勘探282.30百万、开发164.93百万。" },
      { label: "ABI：拉巴斯省工程计划", href: "https://abi.bo/presidente-paz-proyecta-casi-bs-17-000-millones-para-obras-viales-y-otros-proyectos-en-la-paz/", note: "2026年7月15日：近17,000百万玻利维亚诺，首期至少1,000百万。" },
      { label: "Correo del Sur：北部亚马孙电气化贷款", href: "https://correodelsur.com/politica/20260814/paz-anuncia-credito-para-electrificar-pando-y-beni.html", note: "2026年8月14日：美洲开发银行204百万美元，用于Pando和Beni。" },
      { label: "生产发展、农村与水务部：2026投资", href: "https://produccion.gob.bo/nota_prensa/rendicion-de-cuentas-inicial-2026-el-ministerio-de-desarrollo-productivo-rural-y-agua-proyecta-inversion-de-bs-2-719-millones-para-el-fortalecimiento-del-sector/", note: "公共投资2,719.70百万玻利维亚诺。" },
      { label: "Opinión：南部工程包", href: "https://www.opinion.com.bo/articulo/pais/rodrigo-paz-lleva-tarija-plan-inversion-bs-3000-millones-obras-desarrollo/20260905195111995777.html", note: "2026年9月5日：约3,000百万玻利维亚诺，中央与地方各出一半。" },
      { label: "玻利维亚央行：官方汇率", href: "https://www.bcb.gob.bo/tco_reporte_ultima_cotizacion.php", note: "2026年10月9日：1美元＝11.85玻利维亚诺。" },
      { label: "第0181号最高法令（政府采购基本规范，汇编本）", href: "https://www.boliviatv.bo/principal/doc/Normativa/NB-SABS%20DS%20181%20COMPILADO.pdf", note: "国内与国际招标门槛、5%本地优惠、外国企业担保与分包规定。" },
    ],
    fx: "按玻利维亚央行2026年10月9日官方汇率1美元＝11.85玻利维亚诺折算并取整；2026年1月汇率放开后波动较大，仅用于理解量级，不构成报价或财务依据。",
    caution: "改革期法律和机构调整频繁：锂矿合同、油气与矿业新法尚未定型，以最新官方文本为准。头图为既有城市缆车系统照片，不表示该工程当前在招。",
  },
};
