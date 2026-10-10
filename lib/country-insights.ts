export type CountryInsightSummary = {
  slug: string;
  country: string;
  countryCode: string;
  title: string;
  description: string;
  author: string;
  readTime: string;
  heroImage: string;
  /** What the photograph shows, for alt text and captions. */
  heroImageAlt: string;
  /**
   * Every hero is a real photograph from Wikimedia Commons under a free
   * licence (2026-09-26, replacing AI-generated scenes). CC BY / BY-SA
   * require naming the author and the licence, shown under the article hero
   * by components/insights/InsightHeroCredit.tsx; keep this in step with the
   * file whenever the picture changes.
   */
  heroImageCredit: {
    author: string;
    license: string;
    licenseUrl: string;
    sourceUrl: string;
  };
  highlights: string[];
};

export const countryInsights: CountryInsightSummary[] = [
  {
    slug: "mexico",
    country: "墨西哥",
    countryCode: "MX",
    title: "墨西哥国家洞察：2026—2030战略投资与项目机会",
    description:
      "从约3,252亿美元（5.6万亿墨西哥比索）基础设施投资基准出发，拆解能源、铁路、公路、港口、水务、ICT与医疗等重点行业，以及区域分布和中国企业可参与空间。",
    author: "拉美招投标指南针",
    readTime: "约 15 分钟",
    heroImage: "/insights/mexico-el-insurgente.webp",
    heroImageAlt: "墨西哥城—托卢卡城际铁路（El Insurgente）列车驶离辛纳坎特佩克高架车站",
    heroImageCredit: {
      author: "ProtoplasmaKid",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:El_Insurgente_en_estaci%C3%B3n_Zinacantepec_7.jpg",
    },
    highlights: ["约3,252亿美元五年投资基准", "超过1,500个基础设施项目", "八个战略行业"],
  },
  {
    slug: "brazil",
    country: "巴西",
    countryCode: "BR",
    title: "巴西国家洞察：2023—2026 Novo PAC与特许经营机会",
    description:
      "从Novo PAC约3,684亿美元（1.9万亿雷亚尔）投资与4.11万个项目出发，梳理交通、能源、港口、水务、城市建设及PPI特许经营机会。",
    author: "拉美招投标指南针",
    readTime: "约 17 分钟",
    heroImage: "/insights/brazil-belo-monte.webp",
    heroImageAlt: "巴西美丽山（Belo Monte）水电站大坝与厂房航拍",
    heroImageCredit: {
      author: "Marcos Corrêa/PR – Palácio do Planalto",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:2019_Cerim%C3%B4nia_de_Inaugura%C3%A7%C3%A3o_da_Usina_Hidroel%C3%A9trica_Belo_Monte_-_49134734776.jpg",
    },
    highlights: ["约3,684亿美元Novo PAC总投资", "4.11万个Novo PAC项目", "192个PPI联邦项目"],
  },
  {
    slug: "colombia",
    country: "哥伦比亚",
    countryCode: "CO",
    title: "哥伦比亚国家洞察：2023—2026交通重构与能源转型机会",
    description:
      "从约3,691亿美元（1,154.8万亿哥伦比亚比索）国家投资计划出发，梳理铁路、公路、港口、电网、水务与数字基础设施的跨周期项目管线。",
    author: "拉美招投标指南针",
    readTime: "约 16 分钟",
    heroImage: "/insights/colombia-hidroituango.webp",
    heroImageAlt: "哥伦比亚伊图安戈（Hidroituango）水电站航拍",
    heroImageCredit: {
      author: "哥伦比亚总统府官方摄影",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Hidroituango_2022.jpg",
    },
    highlights: ["约3,691亿美元国家投资计划", "约1,027亿美元交通战略组合", "跨周期项目延伸至2055年"],
  },
  {
    slug: "peru",
    country: "秘鲁",
    countryCode: "PE",
    title: "秘鲁国家洞察：2024—2030竞争力规划与物流走廊机会",
    description:
      "从约765.2亿美元（2,575.62亿秘鲁索尔）2026公共预算、2024—2030竞争力规划和2032物流走廊出发，梳理交通、矿业、能源、水务与社会基础设施的区域机会。",
    author: "拉美招投标指南针",
    readTime: "约 17 分钟",
    heroImage: "/insights/peru-southern-railway.webp",
    heroImageAlt: "秘鲁南方铁路：从马塔拉尼港开往拉斯邦巴斯铜矿的集装箱货运列车",
    heroImageCredit: {
      author: "Kabelleger / David Gubler",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:PeruRail_EMD_GT42AC_812_at_Km_99.jpg",
    },
    highlights: ["约765.2亿美元2026公共预算", "44个APP/资产项目与8项增补", "66个矿业投资项目"],
  },
  {
    slug: "chile",
    country: "智利",
    countryCode: "CL",
    title: "智利国家洞察：2025—2055基础设施规划与近期项目机会",
    description:
      "从约4,318亿美元（417万亿智利比索）2025—2055国家基础设施规划出发，区分矿业投资储备与已经进入采购的项目，梳理能源、交通、水务、矿业和数字基础设施机会。",
    author: "拉美招投标指南针",
    readTime: "约 14 分钟",
    heroImage: "/insights/chile-cerro-dominador.webp",
    heroImageAlt: "智利阿塔卡马沙漠塞罗多明加多（Cerro Dominador）光热电站",
    heroImageCredit: {
      author: "Prensa Presidencial, Gobierno de Chile",
      license: "CC BY 3.0 CL",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/cl/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Planta_termosolar_Cerro_Dominador.jpg",
    },
    highlights: ["约4,318亿美元长期规划组合", "24,589项规划倡议", "四大基础设施方向"],
  },
  {
    slug: "argentina",
    country: "阿根廷",
    countryCode: "AR",
    title: "阿根廷国家洞察：2026—2028公共投资与长期战略项目机会",
    description:
      "从国家公共投资计划2026—2028约63.3亿美元（9.53万亿阿根廷比索）三年列示投资与1,164个公共投资项目出发，梳理大型投资激励制度、交通和能源长期项目管线。",
    author: "拉美招投标指南针",
    readTime: "约 16 分钟",
    heroImage: "/insights/argentina-yacyreta.webp",
    heroImageAlt: "阿根廷与巴拉圭边境的亚西雷塔（Yacyretá）水电站大坝和输电设施",
    heroImageCredit: {
      author: "Cmasi（经裁切并压缩为 WebP）",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Yacyret%C3%A1_dam_104947.jpg",
    },
    highlights: ["约63.3亿美元三年列示投资", "1,164个公共投资项目", "交通与能源三年合计约35.2亿美元"],
  },
  {
    slug: "dominican-republic",
    country: "多米尼加",
    countryCode: "DO",
    title: "多米尼加国家洞察：2025—2028公共投资与长期基础设施机会",
    description:
      "从2025—2028国家公共投资计划约73.2亿美元（4,441.83亿多米尼加比索）出发，梳理交通、教育、供水、能源、城市基础设施及公私合作项目机会。",
    author: "拉美招投标指南针",
    readTime: "约 15 分钟",
    // An infrastructure project rather than a skyline (user, 2026-10-05:
    // 感觉Codex选的国家洞察图片不适合，请帮我选择适合的多米尼加工程项目图片替换):
    // the Juan Bosch cable-stayed bridge and the Duarte bridge over the Ozama.
    heroImage: "/insights/dominican-republic-ozama-bridges.webp",
    heroImageAlt: "圣多明各奥萨马河上的胡安·博什（Juan Bosch）斜拉桥与胡安·巴勃罗·杜阿尔特（Juan Pablo Duarte）大桥航拍",
    heroImageCredit: {
      author: "Markocortesa2（经裁切并压缩为 WebP）",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Puente_Juan_Bosch_y_Juan_Pablo_Duarte_desde_un_dron.jpg",
    },
    highlights: ["约73.2亿美元四年规划投资", "约2,024个国家公共投资项目", "交通、教育和住房社区服务约占65.2%"],
  },
  {
    slug: "panama",
    country: "巴拿马",
    countryCode: "PA",
    title: "巴拿马国家洞察：2025—2029公共投资与运河长期机会",
    description: "从302.78亿美元五年指示性投资与运河2025—2035愿景出发，梳理教育、道路、轨道、水务和物流的供应链机会。",
    author: "拉美招投标指南针",
    readTime: "约 10 分钟",
    heroImage: "/insights/panama-agua-clara-locks.webp",
    heroImageAlt: "巴拿马运河扩建的阿瓜克拉拉（Agua Clara）船闸与货轮",
    heroImageCredit: {
      author: "Mariordo（经裁切并压缩为 WebP）",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Agua_Clara_Locks_Panorama_09_2019_0743.jpg",
    },
    highlights: ["302.78亿美元五年指示性投资", "111.88亿美元2026投资预算", "超过80亿美元运河长期愿景"],
  },
  {
    slug: "ecuador",
    country: "厄瓜多尔",
    countryCode: "EC",
    title: "厄瓜多尔国家洞察：2025—2028公共投资与电力水务机会",
    description: "从2025—2029国家发展规划和72.61亿美元四年参考投资出发，区分年度预算与银行融资，梳理能源、水务、连接和公共服务机会。",
    author: "拉美招投标指南针",
    readTime: "约 10 分钟",
    heroImage: "/insights/ecuador-coca-codo-sinclair.webp",
    heroImageAlt: "厄瓜多尔科卡科多辛克莱（Coca Codo Sinclair）水电工程建设设施",
    heroImageCredit: {
      author: "amalavida.tv / 厄瓜多尔旅游部（经裁切并压缩为 WebP）",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:COCACODO_SINCLAIR_006.jpg",
    },
    highlights: ["72.61亿美元四年参考投资", "388个2026年度投资项目", "电力与昆卡水务融资项目"],
  },
  {
    slug: "bolivia",
    country: "玻利维亚",
    countryCode: "BO",
    title: "玻利维亚国家洞察：2026—2028改革期融资与基础设施机会",
    description: "从29.56亿美元2026公共投资预算、美洲开发银行45亿美元支持和YPFB油气投资计划出发，梳理道路、电力、灌溉、油气与锂的项目机会。",
    author: "拉美招投标指南针",
    readTime: "约 10 分钟",
    heroImage: "/insights/bolivia-mi-teleferico.webp",
    heroImageAlt: "玻利维亚拉巴斯城市缆车（Mi Teleférico）红线的吊舱与塔架，背景为拉巴斯谷地",
    heroImageCredit: {
      author: "EEJCC（经裁切并压缩为 WebP）",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:L%C3%ADnea_Roja_de_Mi_Telef%C3%A9rico_en_La_Paz,_Bolivia.jpg",
    },
    highlights: ["29.56亿美元2026公共投资预算", "45亿美元美洲开发银行2026—2028支持", "6.01亿美元YPFB油气投资计划"],
  },
];

export function getCountryInsight(slug: string) {
  return countryInsights.find((insight) => insight.slug === slug);
}
