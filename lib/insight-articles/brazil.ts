import type { InsightArticle } from "@/lib/insight-articles/types";

export const brazilInsight: InsightArticle = {
  slug: "brazil",
  countryEn: "Brazil",
  countryPath: "/countries/brazil",
  kicker: "Infrastructure & procurement outlook",
  // Rebased on the BNDES 2026 study (user, 2026-10-12: 改站内，与这个内容相符合
  // — the 小红书 post 巴西国家洞察：2026—2029，四年投资看哪里？). Figures are Tabela 3
  // of Estudos Especiais do BNDES 64, base scenario, 2026–2029 summed, 2025
  // prices: 电力 444.3、公路 307.4、水务 175.3、电信 159.8、城市交通 143.3、
  // 铁路 49.8、港口 20.4、机场 6.8 = 1,307.1 bilhões. 「Logística」 in that
  // table is the subtotal of the five transport rows and is not counted again.
  headline: ["巴西国家洞察：", "2026—2029，四年投资看哪里？"],
  lede: "从BNDES 2026—2029年基础设施投资预测出发，看电力、公路、水务等八类行业的资金分布、四类重点区域，以及中国企业可关注的方向。",
  published: "2026-09-21",
  modified: "2026-10-12",
  stats: [
    { label: "四年投资预测合计", value: "约2,534亿", unit: "美元", detail: "原币约1.3071万亿雷亚尔", note: "BNDES基准情景，2026—2029年，八类基础设施" },
    { label: "电力", value: "33.99%", unit: "四年占比", detail: "约861亿美元", note: "八类行业中占比最高" },
    { label: "公路", value: "23.52%", unit: "四年占比", detail: "约596亿美元", note: "八类行业中排第二" },
    { label: "电力＋公路＋水务", value: "70.92%", unit: "三项合计占比", detail: "水务13.41%，约340亿美元", note: "其余为电信、城市交通、铁路、港口和机场" },
  ],
  basis: "这是BNDES基准情景下的公共＋私人投资预测，不是政府招标总额，也不是已落实预算。按2025年不变价，只汇总2026—2029年，不含2025年；医疗和教育不在这八类行业内。",
  overview: {
    title: "投资预测看方向，招标看公告",
    points: [
      { lead: "BNDES给出四年规模", text: "《2025—2029投资展望》基准情景：八类基础设施2026—2029年合计约1.3071万亿雷亚尔（约2,534亿美元）。" },
      { lead: "Novo PAC与PPI是政策底座", text: "Novo PAC总投资1.9万亿雷亚尔（约3,684亿美元）；PPI联邦项目组合192个、预计投资3,340亿雷亚尔。与BNDES预测口径不同，不能相加。" },
      { lead: "没有单一采购平台", text: "联邦部委、州、市、公用事业、国企和特许经营公司都可能是实际发包方。" },
    ],
  },
  sectors: {
    title: "投资重点与行业分布",
    intro: "BNDES同一研究口径、基准情景，2026—2029年逐年预测加总；八项合计100%，电力、公路、水务三项占70.92%。",
    shares: true,
    bars: [
      { name: "电力", value: 33.99, tag: "33.99%", amount: "约861亿美元 · 约4,443亿雷亚尔", color: "bg-[#e5ad35]" },
      { name: "公路", value: 23.52, tag: "23.52%", amount: "约596亿美元 · 约3,074亿雷亚尔", color: "bg-[#b95d42]" },
      { name: "水务", value: 13.41, tag: "13.41%", amount: "约340亿美元 · 约1,753亿雷亚尔", color: "bg-[#5aa8ba]" },
      { name: "电信", value: 12.23, tag: "12.23%", amount: "约310亿美元 · 约1,598亿雷亚尔", color: "bg-[#8f73bd]" },
      { name: "城市交通", value: 10.96, tag: "10.96%", amount: "约278亿美元 · 约1,433亿雷亚尔", color: "bg-[#318fae]" },
      { name: "铁路", value: 3.81, tag: "3.81%", amount: "约97亿美元 · 约498亿雷亚尔", color: "bg-[#2d7450]" },
      { name: "港口", value: 1.56, tag: "1.56%", amount: "约40亿美元 · 约204亿雷亚尔", color: "bg-[#67a98d]" },
      { name: "机场", value: 0.52, tag: "0.52%", amount: "约13亿美元 · 约68亿雷亚尔", color: "bg-[#b5bfc4]" },
    ],
    takeaways: [
      { lead: "不只来自新建工程", text: "特许经营优化、存量扩能、气候韧性、数字化改造和长期运维同样持续出单。" },
      { lead: "盯住中标方和总包", text: "对设备与分包企业，识别中标运营商和EPC，与跟踪政府公告同样重要。" },
      { lead: "中小项目数量多", text: "医院、学校等批量项目分散在地方，执行能力和资金来源要逐个判断。" },
      { lead: "投资预测≠正在招标", text: "预测说明钱往哪里去；具体需求、发包方与参与条件，以最新项目文件为准。" },
    ],
  },
  strategy: {
    nav: "落地机制",
    title: "先判断项目属于哪一种落地机制",
    intro: "同一个行业的项目，可能走完全不同的发布和采购路径。",
    items: [
      { tag: "公共采购", title: "政府直接采购", text: "在PNCP发现公告，按文件指定的平台递交；联邦、州、市或公共机构执行合同。" },
      { tag: "特许经营／PPP", title: "拍卖与项目公司", text: "跟踪PPI、主管部委、监管机构和B3拍卖；后续采购多进入项目公司供应链。" },
      { tag: "国企与公用事业", title: "自有采购门户", text: "Petrobras、Eletrobras体系和地方公用事业可能使用自己的供应商和采购系统。" },
    ],
  },
  pipeline: {
    title: "八条行业主线",
    items: [
      { icon: "road", title: "公路建设与特许经营", figure: "32个新项目 · 约3,600亿雷亚尔", text: "传统工程、既有合同优化和新一轮特许经营并行；分别跟踪政府、特许经营公司和其EPC。" },
      { icon: "rail", title: "铁路与多式联运", text: "北向出口通道、中西部粮食产区与东南港口群之间的扩能；轨道、信号、车辆和运维机会多在授权、续约和承包链中。" },
      { icon: "port", title: "港口与航道", figure: "42个项目 · 超过220亿雷亚尔", text: "2025—2026年；除码头租赁外，还有疏浚、仓储、岸电、港机、数字化和集疏运。" },
      { icon: "energy", title: "电网、新能源与油气", text: "东北风光、北部孤网替代、跨区输电和海上油气；覆盖输变电设备、储能、海工装备和运维。" },
      { icon: "water", title: "供水、污水与气候韧性", figure: "371个供水项目 · 125亿雷亚尔（全口径）", text: "联邦、州、市和公用事业共同推进，具体采购入口要逐个核对。" },
      { icon: "city", title: "住房、城市更新与公共交通", text: "住房、BRT、VLT、地铁和公交走廊；常由地方申报、联邦出资，再走地方采购或融资项目。" },
      { icon: "digital", title: "数字基础设施", text: "宽带、数据中心、政府数字化、智能交通和基础设施监测；以设备、软件、集成或服务合同出现。" },
      { icon: "health", title: "医疗、教育与社会设施", text: "医院、学校、托育和文体设施；有分散采购，也有Novo PAC Seleções的批量项目。" },
    ],
  },
  regions: {
    title: "四类区域值得持续跟踪",
    map: {
      src: "/insights/brazil-regions.webp",
      width: 1536,
      height: 1110,
      alt: "巴西重点区域地图，按省级行政区着色：1 北部与亚马孙出口通道、2 东北能源与水务走廊、3 东南工业与物流核心、4 中西部—南部农业物流带",
      caption: "按省级行政区着色，编号对应下方区域卡片，图标为该区域的重点方向；地形质感为美术渲染，仅示意，不代表具体项目选线或投资金额的地域分布。",
    },
    items: [
      { color: "bg-[#35a6c8]", title: "北部与亚马孙出口通道", places: "Pará、Amazonas、Amapá、Rondônia、Tocantins、Acre、Roraima", focus: "河港、河运、输电、数字连接，以及供水和矿业物流；距离、环评和社区协商影响进度与成本。" },
      { color: "bg-[#e5ad35]", title: "东北能源与水务走廊", places: "Bahia、Pernambuco、Ceará、Rio Grande do Norte、Piauí、Maranhão等", focus: "风电、光伏、输电、绿氢、港口、铁路和水安全；同步看电网消纳、许可和港区产业链。" },
      { color: "bg-[#b95d42]", title: "东南工业与物流核心", places: "São Paulo、Rio de Janeiro、Minas Gerais、Espírito Santo", focus: "全国最密集的工业和港口市场：交通、配电、工业升级和ICT，以及港口、城市轨道、油气和水务。" },
      { color: "bg-[#548c58]", title: "中西部—南部农业物流带", places: "Mato Grosso、Goiás、Distrito Federal、Mato Grosso do Sul、Paraná、Santa Catarina、Rio Grande do Sul", focus: "粮食仓储、铁路公路、边境通道、南部港口、电网和气候韧性工程。" },
    ],
    note: "巴西的项目分散在联邦、州、市和运营商手里。先选区域，再列出该区域真正发包的主体，比通看全国公告更有效。",
  },
  opportunities: {
    title: "中国企业可关注方向",
    intro: "规划项目≠已进入招标：仍需核对项目阶段、采购方式与参与条件；主体为各监管或主管机构，实际发包方以公告为准。",
    items: [
      { sector: "能源与配电", scope: ["变压器", "开关设备", "自动化", "工程服务"], buyers: "MME、ANEEL、配电企业及EPC" },
      { sector: "铁路与物流", scope: ["轨道", "车辆", "信号", "设备与运维"], buyers: "ANTT、Infra S.A.、运营商及EPC" },
      { sector: "公路与桥梁", scope: ["工程承包", "路面", "机械", "智慧交通"], buyers: "DNIT、ANTT、州政府及特许经营公司" },
      { sector: "港口与航道", scope: ["港机", "疏浚", "仓储", "岸电与集疏运"], buyers: "MPor、ANTAQ、港务及码头运营商" },
      { sector: "水务与环境", scope: ["泵站", "管网", "处理设备与监测"], buyers: "MCID、州及市政府、水务及PPP运营商" },
      { sector: "ICT", scope: ["网络", "数据中心", "云平台", "网安与集成"], buyers: "MGI/SGD、SERPRO、DATAPREV" },
      { sector: "医疗卫生", scope: ["医疗设备", "医院信息化", "耗材与维保"], buyers: "MS、EBSERH、FIOCRUZ" },
      { sector: "城市与教育", scope: ["公共交通", "校车", "教育设备与设施"], buyers: "MCID、FNDE、州及市政府" },
    ],
  },
  entry: {
    title: "把国家机会变成可执行动作",
    steps: [
      { title: "先选行业和区域", detail: "定一两个行业、重点州和能交付的产品，不从全国公告开始。" },
      { title: "找真正的采购方", detail: "分开政府、州市、国企、公用事业、特许经营公司和EPC，各建名单。" },
      { title: "定进入身份", detail: "直接投标、本地公司、联合体、设备供货或分包；税务、担保、葡语和售后都影响选择。" },
      { title: "双线监测", detail: "一边看PNCP等公告，一边看PPI、拍卖结果和中标项目公司的供应链。" },
      { title: "按文件做决定", detail: "核对资格、认证、标准、本地化、进口税费、汇率和担保后再投入。" },
    ],
    guides: [{ href: "/guides/brazil-pncp", label: "查看巴西PNCP参标指南" }],
  },
  sources: {
    intro: "优先采用BNDES、Casa Civil、交通部、港口与机场部和巴西央行公开资料。规划、项目数量和进度会调整，参与前请回到原文件核对。",
    items: [
      { label: "BNDES：《2025—2029投资展望》（特别研究第64期）", href: "https://web.bndes.gov.br/bib/jspui/bitstream/1408/29327/1/PRFol_216969_Perspectivas%20do%20investimento%202025-2029.pdf", note: "表3基准情景：八类基础设施2026—2029年逐年预测加总约1.3071万亿雷亚尔，2025年不变价；行业占比由此计算。" },
      { label: "Casa Civil：Novo PAC总览", href: "https://www.gov.br/casacivil/pt-br/novopac", note: "1.9万亿雷亚尔总投资、2023—2026与后续投资口径。" },
      { label: "Casa Civil：Novo PAC透明度", href: "https://www.gov.br/casacivil/pt-br/novopac/transparencia", note: "4.11万个项目，可按州及行业筛选。" },
      { label: "巴西政府：2026致国会报告", href: "https://www.gov.br/casacivil/pt-br/.arquivos/mensagem-ao-congresso-nacional-2026.pdf/@@download/file", note: "PPI联邦项目组合192个、预计投资3,340亿雷亚尔（PPI章节）。" },
      { label: "交通部：公路特许经营路演材料（2026年8月版）", href: "https://www.gov.br/transportes/pt-br/assuntos/concessoes/conteudos-rodovias-2026/RoadShow6aEd_PT_2026.08.07site.pdf", note: "2023—2026年32个新项目、约3,600亿雷亚尔。" },
      { label: "港口与机场部：港口项目组合", href: "https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/concessoes/portos", note: "2025—2026年42个港口项目、超过220亿雷亚尔。" },
      { label: "Casa Civil：Novo PAC供水项目", href: "https://www.gov.br/casacivil/pt-br/novopac/agua-para-todos/abastecimento-de-agua", note: "全口径371个项目、125亿雷亚尔，含续建与未完工程及私营借款方遴选；其中新遴选供水项目255个、68亿雷亚尔。" },
      { label: "巴西央行：PTAX美元汇率", href: "https://ptax.bcb.gov.br/ptax_internet/consultarUltimaCotacaoDolar.do", note: "2026年9月18日：1美元＝5.1575雷亚尔。" },
    ],
    fx: "按巴西央行2026年9月18日PTAX收盘卖出价1美元＝5.1575雷亚尔换算并取整，仅用于理解规模，不代表项目结算汇率。",
  },
};
