import type { InsightArticle } from "./types";

export const panamaInsight: InsightArticle = {
  slug: "panama",
  countryEn: "Panama",
  countryPath: "/countries/panama",
  kicker: "巴拿马 · 公共投资与物流枢纽",
  headline: ["巴拿马国家洞察：", "2025—2029公共投资与运河长期机会"],
  lede: "302.78亿美元五年指示性投资，连接教育、道路、轨道与水务。运河长期项目另走独立采购路径，企业应先识别资金与采购主体。",
  published: "2026-10-09",
  modified: "2026-10-09",
  stats: [
    { label: "五年公共投资", value: "302.78", unit: "亿美元", note: "2025—2029指示性投资计划，不是已授标金额" },
    { label: "年度投资预算", value: "111.88", unit: "亿美元", note: "2026国家预算投资安排，不能与五年计划相加" },
    { label: "教育部五年安排", value: "85.24", unit: "亿美元", note: "机构投资口径，不等于校舍工程订单" },
    { label: "运河长期投资", value: "超过80", unit: "亿美元", note: "2025—2035运河愿景估算，独立于一般采购" },
  ],
  basis: "原币即美元口径：官方B/.（巴波亚）按固定1∶1等值列为美元，无浮动汇率换算。五年数字为指示性计划，年度数字为预算，运河数字为长期愿景估算；均非在招或已授标金额，不相加。",
  overview: {
    title: "五年安排：先看机构，再看采购包",
    points: [
      { lead: "302.78亿美元", text: "财政经济部列示2025—2029公共投资，年度额度随预算与执行调整。" },
      { lead: "教育、道路与城市服务", text: "是机构投资的重要方向；设备、施工与运维需分开寻找采购公告。" },
      { lead: "两条采购路径", text: "一般政府项目关注PanamaCompra（公共采购平台），运河项目关注运河管理局的独立采购规则。" },
    ],
    years: { title: "2025—2029指示性投资（亿美元）", items: [
      { year: "2025", value: 55.78404716, amount: "55.78亿", status: "规划" },
      { year: "2026", value: 56.62080787, amount: "56.62亿", status: "规划" },
      { year: "2027", value: 60.01805634, amount: "60.02亿", status: "规划" },
      { year: "2028", value: 63.61913972, amount: "63.62亿", status: "规划" },
      { year: "2029", value: 66.73647757, amount: "66.74亿", status: "规划" },
    ] },
  },
  sectors: {
    title: "机构投入：教育、道路、轨道与水务",
    intro: "以下为五年计划中部分机构的投资安排，不是完整行业占比，也不全是工程采购。",
    bars: [
      { name: "教育部", value: 85.23952871, amount: "85.24亿美元", color: "bg-[#d9a23a]" },
      { name: "公共工程部", value: 35.42039871, amount: "35.42亿美元", color: "bg-[#b54f39]" },
      { name: "巴拿马地铁", value: 16.54397177, amount: "16.54亿美元", color: "bg-[#061b2b]" },
      { name: "卫生部", value: 15.50626832, amount: "15.51亿美元", color: "bg-[#7b63a8]" },
      { name: "国家供水与排水研究所", value: 12.09143308, amount: "12.09亿美元", color: "bg-[#59a8d8]" },
    ],
    takeaways: [
      { lead: "按机构找项目", text: "同一基础设施方向可能由不同机构采购，不能仅凭行业关键词判断预算归属。" },
      { lead: "按合同拆机会", text: "优先核实设备、土建、监理和运维是否分别招标。" },
    ],
  },
  strategy: {
    nav: "长期战略", title: "运河2025—2035：水安全与物流延伸",
    intro: "运河管理局的愿景把供水保障与物流业务相连接，项目阶段和采购渠道需逐项确认。",
    items: [
      { tag: "水安全", title: "印第奥河水库", text: "关注供水保障、环境研究与配套工程；以正式设计、许可和采购文件为准。" },
      { tag: "物流", title: "港口与物流走廊", text: "愿景包括港口码头和物流走廊，适合跟踪装卸、仓储与配套设施需求。" },
      { tag: "能源", title: "能源走廊", text: "关注能源运输与港口连接，不将概念规划视为已获批建设合同。" },
    ],
  },
  pipeline: {
    title: "项目方向：从规划转向具体标包",
    items: [
      { icon: "education", title: "教育设施与装备", figure: "五年机构安排85.24亿美元", text: "观察校舍、教学设备和设施维护；教育投资还包括非工程支出。" },
      { icon: "road", title: "道路与桥梁", figure: "五年机构安排35.42亿美元", text: "观察公共工程部道路、桥梁及维护公告，核实实际工点和合同范围。" },
      { icon: "rail", title: "城市轨道", figure: "五年机构安排16.54亿美元", text: "观察地铁土建、机电、系统与维护，不能将机构总额当成单条线路预算。" },
      { icon: "water", title: "供水与排水", figure: "五年机构安排12.09亿美元", text: "观察管网、泵站、处理设施与监测设备，先核实业主和履约要求。" },
      { icon: "port", title: "运河物流配套", figure: "长期愿景超过80亿美元", text: "水库、港口和走廊按运河管理局规则跟踪，不假设全部进入PanamaCompra。" },
    ],
    note: "方向来自官方规划；具体可投项目以采购公告、标书和资金落实为准。",
  },
  regions: {
    title: "区域机会：业务观察区",
    map: { src: "/insights/panama-infrastructure-regions.webp", width: 1600, height: 900, alt: "巴拿马基础设施观察区：01红色运河与都市枢纽、02黄色西部生产与能源带、03蓝色中部太平洋走廊、04紫色东部连接与韧性区", caption: "按物流连接与公共服务方向划分的业务示意图。" },
    items: [
      { color: "#c85c43", title: "运河与都市枢纽", places: "巴拿马城、科隆、西巴拿马", focus: "运河物流、城市轨道、供水与公共设施。" },
      { color: "#d9a23a", title: "西部生产与能源带", places: "奇里基、博卡斯德尔托罗", focus: "生产连接、道路维护和公共服务设施。" },
      { color: "#59a8d8", title: "中部太平洋走廊", places: "科克莱、贝拉瓜斯、埃雷拉、洛斯桑托斯", focus: "道路、供水、教育与区域服务配套。" },
      { color: "#7b63a8", title: "东部连接与韧性区", places: "达连、巴拿马东部", focus: "连接改善、基本公共服务与韧性需求。" },
    ],
    note: "区域为平台根据官方规划整理的业务观察，不是官方投资分区。地图仅用于说明业务观察区域，不代表精确行政边界、项目位置、投资范围或政治立场。",
  },
  opportunities: {
    title: "企业机会：供应链切入点",
    intro: "以下是基于规划方向的供应链判断，不代表中国企业自动具备投标资格。",
    items: [
      { sector: "交通与轨道", scope: ["桥梁构件与施工设备", "机电系统与维护"], buyers: "公共工程部、地铁及实际采购主体" },
      { sector: "水务", scope: ["管材、泵与阀门", "处理设备与监测"], buyers: "供水排水机构、运河管理局及项目业主" },
      { sector: "公共设施", scope: ["教育与医疗设备", "建筑配套与设施运维"], buyers: "教育部、卫生部及执行机构" },
      { sector: "物流", scope: ["装卸与仓储装备", "港口及走廊配套"], buyers: "运河管理局及项目采购主体" },
    ],
  },
  entry: {
    title: "进入路径：先确认渠道和资格",
    steps: [
      { title: "识别业主", detail: "区分一般政府采购与运河独立采购，先读资金来源及适用规则。" },
      { title: "准备登记", detail: "核实供应商登记、公司文件、授权及译文认证要求。" },
      { title: "筛选标包", detail: "按预算、资格、保证金、交期和现场服务能力判断可参与范围。" },
      { title: "跟踪变更", detail: "持续检查标书补遗、澄清和截止时间，不用规划时间代替投标日期。" },
    ],
    guides: [{ href: "/guides/panama-panamacompra", label: "巴拿马PanamaCompra参标指南" }],
  },
  sources: {
    intro: "金额直接取自官方文件，按亿美元显示并四舍五入；供应链与区域判断不是官方项目承诺。",
    items: [
      { label: "财政经济部：2025—2029指示性投资计划", href: "https://www.mef.gob.pa/wp-content/uploads/2025/05/Plan-Indicativo-de-inversiones-2025-2029.pdf", note: "五年总额、逐年额度及教育、公共工程、地铁、卫生、供水机构安排。" },
      { label: "财政经济部：2026国家预算获签署", href: "https://www.mef.gob.pa/2025/10/sanciona-el-presupuesto-general-del-estado-para-la-vigencia-fiscal-2026/", note: "2026年度投资安排11,188百万巴波亚，不是五年计划同口径。" },
      { label: "运河管理局：2025—2035愿景", href: "https://pancanal.com/vision-2025-2035/", note: "超过8,000百万巴波亚长期投资估算及水库、能源、港口、物流方向。" },
      { label: "运河管理局：印第奥河项目", href: "https://pancanal.com/rioindio/", note: "供水保障项目背景，未将愿景转换为在招合同。" },
      { label: "PROPANAMA：巴拿马投资环境", href: "https://propanama.mici.gob.pa/panama/", note: "美元使用与巴波亚固定等值口径。" },
      { label: "DGCP：公共采购平台", href: "https://www.panamacompra.gob.pa/", note: "一般政府采购入口；登记和投标边界见参标指南。" },
    ],
    fx: "原币即美元口径；B/.按固定1∶1等值列示美元，不另取市场汇率。",
    caution: "未核实的单项工程金额、采购日期和区域额度不列示。规划、年度预算与运河愿景不能相加，也不代表当前开放投标。",
  },
};
