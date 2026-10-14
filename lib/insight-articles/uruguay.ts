import type { InsightArticle } from "./types";

/**
 * Uruguay, written to lib/insight-articles/README.md (user, 2026-10-14: 写乌拉圭
 * 的国家洞察和参标指南). Uruguay publishes no multi-year, all-sector public
 * investment total, so the page is built from what each institution has
 * published — the Ministry of Transport's five-year works envelope, UTE's
 * five-year budget, the IDB's country strategy, the loans for Montevideo's
 * transport reform and the Casupá dam — each on its own basis, never added.
 * Every source states its figure in US dollars, so nothing is converted.
 */
export const uruguayInsight: InsightArticle = {
  slug: "uruguay",
  countryEn: "Uruguay",
  countryPath: "/countries/uruguay",
  kicker: "Infrastructure & financing outlook",
  headline: ["乌拉圭国家洞察：", "2026—2030交通、水与电网投资机会"],
  lede: "财政空间偏紧，新一届政府把公路桥梁、首都公交改造、供水安全和电网放在前面，多边银行和国企资金随之进场。项目多走公开招标，但融资承诺不等于在招合同。",
  published: "2026-10-14",
  modified: "2026-10-14",
  stats: [
    { label: "交通部五年工程与服务", value: "26亿", unit: "美元", detail: "原文即美元口径", note: "77个合同在执行，规划50余项新招标" },
    { label: "UTE五年投资预算", value: "18亿", unit: "美元", detail: "原文即美元口径", note: "2026年计划投资2.8亿美元" },
    { label: "美洲开发银行国别战略", value: "最高50亿", unit: "美元", detail: "原文即美元口径", note: "2026—2030，含主权、私营部门与技术合作" },
    { label: "首都公交改造融资", value: "8亿", unit: "美元", detail: "原文即美元口径", note: "美洲开发银行5亿＋CAF最高3亿，电动BRT" },
  ],
  basis: "乌拉圭没有覆盖全部行业的多年公共投资总盘子：本文分别列示交通部、国家电力公司UTE的五年计划和多边银行的融资承诺，口径不同，不相加。各来源均以美元公布，未做汇率折算。",
  overview: {
    title: "财政偏紧，投资靠部委计划、国企和多边银行",
    points: [
      { lead: "2025—2029预算法已生效", text: "第20.446号法律2025年12月16日颁布，2026年1月起执行；经济财政部称新政府接手时的财政赤字为1995年以来最高。" },
      { lead: "新增预算有限", text: "预算法新增拨款2026年1.4亿美元，到2029年增至2.4亿美元。" },
      { lead: "多边银行资金加速", text: "美洲开发银行预计2026年放款16.5亿美元，是2025年的三倍多。" },
    ],
  },
  sectors: {
    title: "已公开的资金盘子：口径不同，不能相加",
    intro: "以下为各机构公开的五年计划、融资承诺或私人投资意向，统一按亿美元列示。不是行业预算，也不代表已开标。",
    bars: [
      { name: "HIF派桑杜绿色燃料项目", value: 53.85, amount: "约53.85亿美元", tag: "私人项目·未签约", color: "bg-[#548c58]" },
      { name: "美洲开发银行国别战略", value: 50, amount: "最高50亿美元", tag: "2026—2030", color: "bg-[#59a8d8]" },
      { name: "交通部工程与服务", value: 26, amount: "26亿美元以上", tag: "五年", color: "bg-[#c85c43]" },
      { name: "UTE投资预算", value: 18, amount: "18亿美元", tag: "五年", color: "bg-[#d9a23a]" },
      { name: "蒙得维的亚第二集装箱码头", value: 9, amount: "9亿美元", tag: "私人提案·待审", color: "bg-[#7b63a8]" },
      { name: "首都公交改造融资", value: 8, amount: "8亿美元", tag: "美洲开发银行＋CAF", color: "bg-[#35a6c8]" },
      { name: "卡苏帕水库", value: 1.3, amount: "1.3亿美元", tag: "CAF贷款", color: "bg-[#061b2b]" },
    ],
    takeaways: [
      { lead: "公共工程走招标", text: "交通部、UTE和国家水务公司OSE的项目通过ARCE平台公开招标，金额较大的多为公开招标。" },
      { lead: "私人项目另看", text: "绿色燃料和码头是私人投资，采购由企业自己决定，不走政府招标。" },
    ],
  },
  pipeline: {
    title: "项目方向：有资金，不等于已开标",
    items: [
      { icon: "road", title: "全国公路与桥梁", figure: "交通部26亿美元以上（五年）", text: "77个合同在执行，规划50余项新招标，其中40%在2026—2027年发布；加固102座桥梁，贯通东西向的26号公路，改造2号公路货运走廊和11号公路双向车道。" },
      { icon: "city", title: "蒙得维的亚公交改造", figure: "融资8亿美元", text: "8 de Octubre和Italia大道两条电动高运量BRT走廊，含专用道、立交、Tres Cruces换乘站和18 de Julio大道地下段；交通部长希望2026年最后几个月招标。" },
      { icon: "water", title: "卡苏帕水库", figure: "CAF贷款1.3亿美元", text: "库容1.18亿立方米，为首都供水；四家联合体通过资格预审，其中CCCC-YREC-Impacto和Consorcio Casupá（SinoHydro10与Grinor）含中国企业。计划年底授标，2027—2029年施工。" },
      { icon: "energy", title: "电网与发电", figure: "UTE 2026年计划2.8亿美元", text: "配电约1.31亿美元、输电5,900万美元、发电6,500万美元，含Baygorria、Bonete、Palmar水电站改造；另寻约3亿美元融资建第三条南北输电走廊，Fray Bentos首座光伏电站招标。" },
      { icon: "port", title: "港口与绿色燃料", figure: "私人投资：约53.85亿＋9亿美元", text: "HIF派桑杜电制燃料项目2025年12月签谅解备忘录，尚未签投资合同；Neltume Ports提出9亿美元的第二集装箱码头，尚待政府和港口局审批。" },
    ],
    note: "金额按各机构公布口径列示；同一项目可能同时出现在部委计划和银行融资里，不能相加。私人项目的采购由企业自行决定。",
  },
  regions: {
    title: "区域机会：首都圈、中部、西部河岸与东北走廊",
    map: { src: "/insights/uruguay-regions.svg", width: 1600, height: 1000, alt: "乌拉圭重点区域地图，按省级行政区着色：1 南部首都都市圈、2 中部水源与能源带、3 西部河岸物流与新能源带、4 东北边境与东部走廊", caption: "按省级行政区着色，编号对应下方区域卡片，图标为该区域的重点方向；不代表具体项目选线或投资金额的地域分布。" },
    items: [
      { color: "bg-[#c85c43]", title: "南部首都都市圈", places: "Montevideo、Canelones、San José", focus: "BRT公交、城市道路和港口；UTE在蒙得维的亚新建输电站，公交改造施工期交通管制较多。" },
      { color: "bg-[#d9a23a]", title: "中部水源与能源带", places: "Florida、Durazno、Flores、Lavalleja", focus: "卡苏帕水库、水电站改造和铁路延伸至ANCAP杜拉斯诺工厂；卡苏帕位于Florida省，需等环境许可后授标。" },
      { color: "bg-[#59a8d8]", title: "西部河岸物流与新能源带", places: "Colonia、Soriano、Río Negro、Paysandú、Salto、Artigas", focus: "Nueva Palmira港货运、光伏和绿色燃料；Fray Bentos首座光伏电站招标，HIF项目仍待签约。" },
      { color: "bg-[#7b63a8]", title: "东北边境与东部走廊", places: "Rivera、Tacuarembó、Cerro Largo、Treinta y Tres、Rocha、Maldonado等", focus: "26号公路、跨Yaguarón河第二座桥和输电；UTE用自有资金在Melo新建电站，Tacuarí和Cebollatí研究新港口平台。" },
    ],
    note: "区域为平台根据公开资料整理的业务观察，不是官方投资分区。地图仅用于说明业务观察区域，不代表精确行政边界、项目位置、投资范围或政治立场。",
  },
  opportunities: {
    title: "企业机会：工程、设备与长期服务",
    intro: "以下为公开资金方向对应的供应链判断；外国企业资格、本国产品优惠和融资采购规则必须逐标核实。",
    items: [
      { sector: "公路与桥梁", scope: ["公路改建", "桥梁加固", "施工设备", "养护"], buyers: "交通部（MTOP）国家公路局、乌拉圭公路公司（CVU）、省政府" },
      { sector: "城市交通", scope: ["电动大巴", "站台与专用道", "地下段土建", "信号与票务"], buyers: "交通部、蒙得维的亚市政府" },
      { sector: "电力与新能源", scope: ["变电站与线路", "光伏电站", "水电站改造", "配电与计量"], buyers: "国家电力公司（UTE）" },
      { sector: "水利与供水", scope: ["水库土建", "泵站管网", "净水设备"], buyers: "国家水务公司（OSE）" },
      { sector: "港口与物流", scope: ["码头设备", "疏浚", "仓储与堆场"], buyers: "国家港口局（ANP）、码头特许经营方" },
      { sector: "油气与炼化", scope: ["炼厂检修", "储运设备", "工程服务"], buyers: "国家石油公司（ANCAP）" },
    ],
  },
  entry: {
    title: "进入路径：资金、登记、担保与本地伙伴",
    steps: [
      { title: "分清资金", detail: "国家预算和国企项目在ARCE平台按采购法公告；多边银行融资项目可能按出资方规则执行。" },
      { title: "登记RUPE", detail: "外国企业可用本国税号在国家供应商统一登记（RUPE）注册，境外文件需认证并译成西班牙语。" },
      { title: "看清门槛", detail: "2026年1,370.5万比索（约34万美元）以上为公开招标；公告通常不公布预算。" },
      { title: "备好担保", detail: "履约保证金一般为中标金额的5%，可用银行保函或保证保险。" },
      { title: "找本地伙伴", detail: "本国货物、服务和工程有8%的价格优惠；送达、代表和售后需要可靠的当地合作方。" },
    ],
    guides: [{ href: "/guides/uruguay-arce", label: "查看乌拉圭ARCE参标指南" }],
  },
  sources: {
    intro: "仅引用政府、国企与多边银行公开信息及主流媒体报道。",
    items: [
      { label: "IMPO：第20.446号法律（2025—2029预算法）", href: "https://www.impo.com.uy/bases/leyes/20446-2025", note: "2025年12月16日颁布，2026年1月1日起执行。" },
      { label: "经济财政部：预算法主要方向", href: "https://www.gub.uy/ministerio-economia-finanzas/comunicacion/noticias/ministro-economia-anuncio-principales-lineamientos-ley-presupuesto", note: "2025年8月：新增拨款2026年1.4亿美元，2029年增至2.4亿美元；接手时的赤字为1995年以来最高。" },
      { label: "交通部：2025—2029预算重点", href: "https://www.gub.uy/ministerio-transporte-obras-publicas/comunicacion/noticias/mtop-anuncio-transformaciones-estrategicas-para-sector-transporte-obras", note: "2025年9月22日：都市交通管理机构、26/4/2/11号公路，铁路延伸至ANCAP在杜拉斯诺和蒙得维的亚的工厂。" },
      { label: "Montevideo Portal：交通部26亿美元与50项新招标", href: "https://www.montevideo.com.uy/Noticias/Etcheverry-anuncio-US-2-600-millones-de-inversion-y-50-licitaciones-nuevas-para-el-MTOP-uc959177", note: "2026年4月15日：五年工程与服务26亿美元以上，77个合同在执行，50余项新招标，40%在2026—2027年发布。" },
      { label: "Ámbito：交通部投资计划", href: "https://www.ambito.com/uruguay/el-mtop-lanza-una-mega-inversion-us-2600-millones-rutas-puentes-y-un-nuevo-tren-pasajeros-n6269674", note: "2026年4月22日：102座桥梁、26号公路、跨Yaguarón河第二座桥、Tacuarí和Cebollatí港口研究。" },
      { label: "Somos Uruguay：交通部公路计划", href: "https://somosuruguay.com.uy/politicas-publicas/mtop-invertira-2100-millones-dolares-infraestructura-n2907", note: "2026年5月19日：2号公路、11号公路双向车道等，资金来自部预算、乌拉圭公路公司和私人参与。" },
      { label: "Búsqueda：UTE 2026投资计划", href: "https://www.busqueda.com.uy/economia/ute-planea-inversiones-us-280-millones-la-distribucion-y-generacion-energia-2026-n5410902", note: "2026年3月5日：2026年2.8亿美元，五年预算18亿美元；配电、输电5,900万、发电6,500万；另寻约3亿美元建第三条输电走廊。" },
      { label: "Ámbito：UTE十年规划与Fray Bentos光伏招标", href: "https://www.ambito.com/uruguay/ute-proyecta-inversiones-10-anos-generacion-y-transmision-electrica-y-anuncia-una-licitacion-solar-fray-bentos-n6309252", note: "2026年8月10日：发电与输电十年规划，Fray Bentos首座光伏电站即将招标。" },
      { label: "Bloomberg Línea：美洲开发银行国别战略", href: "https://www.bloomberglinea.com/latinoamerica/uruguay/grupo-bid-preve-destinar-hasta-us5000-millones-a-uruguay-entre-2026-y-2030/", note: "2026年8月4日：2026—2030最高50亿美元（初始估计42亿），2026年预计放款16.5亿美元。" },
      { label: "El Observador：首都公交改造融资", href: "https://www.elobservador.com.uy/nacional/megaobra-del-transporte-montevideo-la-caf-otorgo-un-prestamo-y-el-proyecto-ya-tiene-us-800-millones-financiamiento-n6028600", note: "2025年12月18日：CAF最高3亿美元，加美洲开发银行5亿美元；两条电动BRT走廊和18 de Julio地下段。" },
      { label: "El Observador：美洲开发银行5亿美元信贷额度", href: "https://www.elobservador.com.uy/nacional/gobierno-consigue-los-fondos-la-reforma-del-transporte-cerro-el-bid-esta-tramites-la-caf-y-el-banco-mundial-n6026092", note: "2025年11月27日：交通部长希望2026年最后几个月招标。" },
      { label: "总统府：卡苏帕水库国际招标", href: "https://www.gub.uy/presidencia/comunicacion/noticias/ose-represa-casupa-licitacion-internacional-ferreri", note: "2026年6月30日：约1.3亿美元，CAF融资，年底授标，施工30个月。" },
      { label: "Subrayado：卡苏帕水库预审结果", href: "https://www.subrayado.com.uy/ose-aprobo-pliego-la-licitacion-la-construccion-la-represa-casupa-hay-cuatro-consorcios-precalificados-n1011271", note: "2026年6月25日：四家联合体预审通过；库容1.18亿立方米，2027—2029年施工。" },
      { label: "Ámbito：CAF向OSE贷款1.3亿美元", href: "https://www.ambito.com/uruguay/caf-oficializa-el-prestamo-ose-us-130-millones-casupa-mientras-avanzan-las-expropiaciones-n6280574", note: "2026年5月22日：原水储备由8,000万立方米增至2亿立方米。" },
      { label: "HIF Global：与乌拉圭政府签署协议", href: "https://hifglobal.com/media/news-description/2025/12/19/hif-global-and-government-of-uruguay-sign-agreement-to-accelerate-e-fuels-project-in-paysand%C3%BA", note: "2025年12月19日：派桑杜电制燃料项目谅解备忘录。" },
      { label: "La Mañana：HIF项目投资额", href: "https://www.xn--lamaana-7za.uy/actualidad/el-gobierno-ultima-los-detalles-y-se-prepara-para-anunciar-la-inversion-de-us-5-385-millones-de-hif-en-paysandu/", note: "约53.85亿美元；投资合同尚未签署。" },
      { label: "El Observador：Neltume Ports第二集装箱码头提案", href: "https://www.elobservador.com.uy/terminal-neltume-ports-un-anuncio-inversion-que-el-gobierno-no-festejo-y-la-controversia-que-puede-generar-katoen-natie-n6057407", note: "2026年9月9日公布：9亿美元，年吞吐115万标箱，待交通部和港口局审批。" },
    ],
    fx: "本文金额均为来源原文的美元口径，未做汇率折算；比索金额仅见于采购门槛，按税务总局公布的2026年9月30日银行间汇率1美元＝40.286比索折算，仅用于理解量级。",
    caution: "部分项目仍在审批或签约前阶段：HIF绿色燃料项目和第二集装箱码头尚未获批，卡苏帕水库授标取决于环境许可。头图为蒙得维的亚港既有集装箱码头，不表示该码头当前在招。",
  },
};
