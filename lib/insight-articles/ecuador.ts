import type { InsightArticle } from "./types";

export const ecuadorInsight: InsightArticle = {
  slug: "ecuador",
  countryEn: "Ecuador",
  countryPath: "/countries/ecuador",
  kicker: "厄瓜多尔 · 能源韧性与公共服务",
  headline: ["厄瓜多尔国家洞察：", "多年公共投资、电力与水务机会"],
  lede: "72.61亿美元四年参考投资，服务2025—2029国家发展规划。电网可靠性、水务和交通连接值得跟踪，但预算与贷款都不等于在招合同。",
  published: "2026-10-09",
  modified: "2026-10-09",
  stats: [
    { label: "四年参考投资", value: "72.61", unit: "亿美元", note: "国家发展规划列示2025—2028参考额度" },
    { label: "年度投资计划", value: "21.81", unit: "亿美元", note: "国民议会公布的2026年度投资计划" },
    { label: "年度投资项目", value: "388", unit: "个", note: "2026年度投资项目数，不是招标次数" },
    { label: "电力项目融资", value: "3", unit: "亿美元", note: "美洲开发银行EC-L1306贷款，不是项目总成本" },
  ],
  basis: "原币即美元，无汇率换算。72.61亿美元为2025—2028参考投资上限汇总，排除资本保全计划；2026年度计划、预算草案项目额度和银行贷款分别列示，不相加，均非已授标金额。",
  overview: {
    title: "跨年度规划：投资额度可随预算调整",
    points: [
      { lead: "2025—2029国家发展规划", text: "把公共服务、生产、环境水能源及连接、制度和风险韧性纳入发展方向。" },
      { lead: "2025—2028参考额度", text: "官方表列四年投资上限；2029拟延续上一年度预算，不另补推测金额。" },
      { lead: "2026年度计划另列", text: "年度预算更新不等于原规划不变，企业需看具体执行机构和采购计划。" },
    ],
    years: { title: "四年参考投资（亿美元）", items: [
      { year: "2025", value: 22.0168, amount: "22.02亿", status: "参考上限" },
      { year: "2026", value: 15.8802, amount: "15.88亿", status: "原规划" },
      { year: "2027", value: 17.03, amount: "17.03亿", status: "参考上限" },
      { year: "2028", value: 17.68, amount: "17.68亿", status: "参考上限" },
    ] },
  },
  sectors: {
    title: "预算项目：能源与公共服务切入点",
    intro: "以下为央行分析的2026预算草案中部分投资项目额度，按百万美元原表换算；不是完整行业预算，也未认定为最终采购包金额。",
    bars: [
      { name: "追加电力生产能力", value: 1.46, amount: "1.46亿美元", color: "bg-[#d9a23a]" },
      { name: "亚马孙区域综合发展", value: 0.77, amount: "0.77亿美元", color: "bg-[#59a8d8]" },
      { name: "住房解决方案", value: 0.58, amount: "0.58亿美元", color: "bg-[#b54f39]" },
      { name: "农业生产促进", value: 0.53, amount: "0.53亿美元", color: "bg-[#061b2b]" },
      { name: "ECU 911应急服务现代化", value: 0.50, amount: "0.50亿美元", color: "bg-[#7b63a8]" },
    ],
    takeaways: [
      { lead: "电力可靠性", text: "从新增能力延伸到电网、设备、控制与运维，具体范围仍以采购文件为准。" },
      { lead: "公共服务韧性", text: "住房、区域服务和应急设施需要结合执行机构、场地与维护要求判断。" },
    ],
  },
  strategy: {
    nav: "多年战略", title: "国家发展规划：连接、能源与风险韧性",
    intro: "规划提供方向，年度资金与项目采购计划决定实际进入窗口。",
    items: [
      { tag: "能源", title: "优化能源效率", text: "关注可再生能源、供电可靠性和环境保护之间的约束。" },
      { tag: "连接", title: "实体与数字基础设施", text: "规划强调可持续、韧性的连接，优先识别有执行机构和资金的项目。" },
      { tag: "公共服务", title: "水务与区域平衡", text: "安全饮水、环境治理和公共服务属于长期方向，地方项目需单独核实。" },
      { tag: "韧性", title: "自然风险应对", text: "项目筛选同时检查灾害、地质、环境许可及长期维护条件。" },
    ],
  },
  pipeline: {
    title: "项目管线：有融资，不等于已开标",
    items: [
      { icon: "energy", title: "电力可靠性计划", figure: "项目总成本约3.78亿美元", text: "美洲开发银行EC-L1306贷款3亿美元，覆盖供电可靠性、接入与韧性方向。" },
      { icon: "water", title: "昆卡供水与污水服务", figure: "项目总成本0.93亿美元", text: "EC-L1297贷款0.70亿美元，关注水源、供水及污水处理；采购计划单独确认。" },
      { icon: "road", title: "实体连接与运输", text: "依据国家发展规划观察交通基础设施，不在缺少官方文件时补写单项金额。" },
      { icon: "digital", title: "应急与数字服务", figure: "预算草案列示0.50亿美元", text: "ECU 911现代化属于预算观察方向，不能由额度推断设备清单或开标日期。" },
    ],
    note: "银行项目按融资文件和采购计划执行；政策改革贷款不能当作工程订单。",
  },
  regions: {
    title: "区域机会：地形与公共服务需求",
    map: { src: "/insights/ecuador-infrastructure-regions.webp", width: 1600, height: 900, alt: "厄瓜多尔基础设施观察区：01红色安第斯都市与交通带、02黄色太平洋港口与产业带、03蓝色亚马孙能源与连接区、04紫色加拉帕戈斯公共服务区", caption: "以地形、连接和公共服务为线索的业务观察示意图。" },
    items: [
      { color: "#c85c43", title: "安第斯都市与交通带", places: "基多、昆卡及安第斯城市", focus: "城市供水、污水服务、交通和公共设施。" },
      { color: "#d9a23a", title: "太平洋港口与产业带", places: "瓜亚斯、马纳比、埃尔奥罗", focus: "生产连接、物流配套与公共服务。" },
      { color: "#59a8d8", title: "亚马孙能源与连接区", places: "纳波、苏昆比奥斯及亚马孙地区", focus: "供电接入、区域发展与环境约束。" },
      { color: "#7b63a8", title: "加拉帕戈斯公共服务区", places: "加拉帕戈斯群岛", focus: "能源与公共服务，重点核实生态保护及运输条件。" },
    ],
    note: "区域为平台的业务观察，不是官方投资分区或采购承诺。地图仅用于说明业务观察区域，不代表精确行政边界、项目位置、投资范围或政治立场。",
  },
  opportunities: {
    title: "企业机会：设备、工程与长期服务",
    intro: "以下为官方规划方向对应的供应链判断；外国企业资格、国产优先和融资采购规则必须逐标核实。",
    items: [
      { sector: "电力", scope: ["输配电与控制设备", "运维及韧性配套"], buyers: "电力主管机构、执行单位及公用事业企业" },
      { sector: "水务", scope: ["泵、管网与仪表", "污水处理及服务设备"], buyers: "昆卡供水电信公共企业（ETAPA EP）及地方业主" },
      { sector: "连接", scope: ["道路工程配套", "数字连接与设施维护"], buyers: "交通与公共服务执行机构" },
      { sector: "公共服务", scope: ["住房配套与设施设备", "应急系统与维护"], buyers: "住房、应急及地方采购主体" },
    ],
  },
  entry: {
    title: "进入路径：公开研究与人工投标分开",
    steps: [
      { title: "确认资金", detail: "区分国家预算、地方项目和银行融资，读取对应采购规则。" },
      { title: "准备资格", detail: "核实统一供应商登记、外国公司证明、授权及认证译文。" },
      { title: "人工查标", detail: "由用户自己在官方页面查阅项目、标书、澄清和关键日期。" },
      { title: "核实履约", detail: "检查签名、保证金、本地服务、税费和环境要求后决定是否投标。" },
    ],
    guides: [{ href: "/guides/ecuador-soce", label: "厄瓜多尔SOCE参标指南" }],
  },
  sources: {
    intro: "仅引用公开规划、法规、预算分析和银行项目文件；未访问SOCE采购系统或项目详情。",
    items: [
      { label: "国家发展规划2025—2029（国民议会公开版）", href: "https://www.asambleanacional.gob.ec/sites/default/files/plan_nacional_de_desarrollo_25-29.pdf", note: "印刷页371表20：2025—2028参考投资2,201.68、1,588.02、1,703.00、1,768.00百万美元，合计7,260.70百万；排除资本保全计划。" },
      { label: "国民议会：批准2026预算及多年财政编程", href: "https://www.asambleanacional.gob.ec/es/node/111155", note: "年度投资计划2,181.47百万美元、388个投资项目。" },
      { label: "厄瓜多尔央行：2026预算草案分析", href: "https://contenido.bce.fin.ec/documentos/Administracion/ProformaPresupuesto_112025.pdf", note: "印刷页58表31：电力146、亚马孙77、住房58、农业53、ECU 911现代化50百万美元；均按草案项目口径列示。" },
      { label: "美洲开发银行：EC-L1306电力可靠性", href: "https://www.iadb.org/es/proyecto/EC-L1306", note: "总成本378,299,286美元，其中银行贷款300,000,000美元；不与国家预算相加。" },
      { label: "美洲开发银行：EC-L1297昆卡水务", href: "https://www.iadb.org/es/proyecto/EC-L1297", note: "项目总成本93,000,000美元，其中贷款70,000,000美元。" },
      { label: "SERCOP：统一供应商登记", href: "https://portal.compraspublicas.gob.ec/sercop/registro-unico-de-proveedores/", note: "公开登记政策；实际登记和投标由用户在官方页面自行操作。" },
    ],
    fx: "原币即美元，官方表以USD列示，无汇率换算；显示值按亿美元四舍五入。",
    caution: "未核实的工程金额、开标日期和地区分配不列示；2029未另估金额。头图为既有水电工程建设照片，不表示该工程当前在招。",
  },
};
