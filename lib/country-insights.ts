export type CountryInsightSummary = {
  slug: string;
  country: string;
  countryCode: string;
  title: string;
  description: string;
  author: string;
  readTime: string;
  heroImage: string;
  highlights: string[];
};

export const countryInsights: CountryInsightSummary[] = [
  {
    slug: "mexico",
    country: "墨西哥",
    countryCode: "MX",
    title: "墨西哥国家洞察：2026—2030战略投资与项目机会",
    description:
      "从5.6万亿比索（约3,252亿美元）基础设施投资基准出发，拆解能源、铁路、公路、港口、水务、ICT与医疗等重点行业，以及区域分布和中国企业可参与空间。",
    author: "拉美招投标指南针",
    readTime: "约 15 分钟",
    heroImage: "/insights/mexico-infrastructure-hero.webp",
    highlights: ["5.6万亿比索（约3,252亿美元）规划投资", "超过1,500个项目", "八个战略行业"],
  },
  {
    slug: "brazil",
    country: "巴西",
    countryCode: "BR",
    title: "巴西国家洞察：Novo PAC、特许经营与区域基础设施机会",
    description:
      "从Novo PAC的1.9万亿雷亚尔（约3,684亿美元）投资与4.11万个项目出发，梳理交通、能源、港口、水务、城市建设及PPI特许经营机会。",
    author: "拉美招投标指南针",
    readTime: "约 17 分钟",
    heroImage: "/insights/brazil-infrastructure-hero.webp",
    highlights: ["1.9万亿雷亚尔（约3,684亿美元）", "4.11万个Novo PAC项目", "192项PPI项目"],
  },
  {
    slug: "colombia",
    country: "哥伦比亚",
    countryCode: "CO",
    title: "哥伦比亚国家洞察：交通重构、能源转型与区域机会",
    description:
      "从1,154.8万亿哥伦比亚比索（约3,691亿美元）国家投资计划出发，梳理铁路、公路、港口、电网、水务与数字基础设施的跨周期项目管线。",
    author: "拉美招投标指南针",
    readTime: "约 16 分钟",
    heroImage: "/insights/colombia-infrastructure-hero.webp",
    highlights: ["1,154.8万亿比索（约3,691亿美元）国家投资计划", "321.3万亿比索（约1,027亿美元）交通项目", "跨周期项目延伸至2055年"],
  },
  {
    slug: "peru",
    country: "秘鲁",
    countryCode: "PE",
    title: "秘鲁国家洞察：竞争力、物流走廊与战略项目机会",
    description:
      "从2024—2030竞争力规划、2032物流走廊和2026项目组合出发，梳理交通、矿业、能源、水务与社会基础设施的区域机会。",
    author: "拉美招投标指南针",
    readTime: "约 17 分钟",
    heroImage: "/insights/peru-infrastructure-hero.webp",
    highlights: ["561.57亿索尔（约166.8亿美元）公共投资", "44个APP/资产项目与8项增补", "66个矿业投资项目"],
  },
  {
    slug: "chile",
    country: "智利",
    countryCode: "CL",
    title: "智利国家洞察：2025—2055基础设施规划与近期项目机会",
    description:
      "区分智利2025—2055国家基础设施规划、矿业投资储备与已经进入采购的项目，梳理能源、交通、水务、矿业和数字基础设施机会。",
    author: "拉美招投标指南针",
    readTime: "约 14 分钟",
    heroImage: "/insights/chile-infrastructure-hero.webp",
    highlights: ["417万亿智利比索（约4,318亿美元）长期规划组合", "24,589项规划倡议", "四大基础设施方向"],
  },
];

export function getCountryInsight(slug: string) {
  return countryInsights.find((insight) => insight.slug === slug);
}

// The homepage remains a four-card preview; newer insights live in /insights.
const HOMEPAGE_INSIGHT_SLUGS = ["mexico", "brazil", "colombia", "peru"] as const;

export function homepageCountryInsights(): CountryInsightSummary[] {
  return HOMEPAGE_INSIGHT_SLUGS.map(getCountryInsight).filter(
    (insight): insight is CountryInsightSummary => insight !== undefined,
  );
}
