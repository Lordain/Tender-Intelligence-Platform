import type { IndustryKey } from "@/lib/industry";

/**
 * The industry landing pages (/industries/power …), one per industry tag
 * except 综合 (2026-09-25). Same reason the country pages exist: a filtered
 * /tenders?industry=… view declares /tenders as its canonical, so nothing on
 * the site could rank for 拉美电力招标 or 南美水务工程招标 on its own.
 *
 * 综合 has no page: it is the tag for "no industry rule matched", which is
 * not something anyone searches for.
 *
 * `name` is the phrase the page ranks for (电力, 水务工程), which is not
 * always the short tag on the cards (水工程, ICT) — the tag is sized for a
 * pill, the name for a search box. The intro describes what the tag actually
 * covers in lib/industry.ts's rules, so it promises no project type the
 * classifier does not put there.
 */
export type IndustryPage = {
  slug: string;
  industry: IndustryKey;
  name: string;
  /** What follows 「｜」 in the <title>: the concrete things people search for. */
  titleTail: string;
  intro: string;
};

export const industryPages: IndustryPage[] = [
  {
    slug: "power",
    industry: "power",
    name: "电力",
    titleTail: "输变电、发电与配电工程招标",
    intro: "电力类项目包括输电线路与变电站、配电网改造、发电站建设与设备采购，以及电网运维服务；采购方既有各国政府，也有墨西哥联邦电力委员会（CFE）、米纳斯吉拉斯州能源公司（Cemig）等国有电力企业，哥伦比亚的输电项目则由矿业能源规划署（UPME）公开招商。",
  },
  {
    slug: "energy-mining",
    industry: "energy_mining",
    name: "能源矿业",
    titleTail: "石油、天然气与矿业采购",
    intro: "能源矿业类项目主要来自国有石油与矿业公司：巴西国家石油公司（Petrobras）、墨西哥国家石油公司（Pemex）、秘鲁国家石油公司（Petroperú）和智利国家铜业公司（Codelco），涵盖油气设备与工程服务、管道与储运设施、矿山设备和矿区工程。",
  },
  {
    slug: "water",
    industry: "water",
    name: "水务工程",
    titleTail: "供水、污水处理与水利工程招标",
    intro: "水务工程类项目包括饮用水厂与输水管道、污水处理厂与排水管网、泵站、灌溉渠道与水利设施，采购方多为各国市政府、州政府和水务机构。",
  },
  {
    slug: "transportation",
    industry: "transportation",
    name: "交通基建",
    titleTail: "公路、桥梁、港口与轨道交通招标",
    intro: "交通基建类项目包括公路新建与改扩建、桥梁、城市道路、港口与航道、机场和轨道交通，以及相关的勘察设计与养护服务。",
  },
  {
    slug: "construction",
    industry: "construction",
    name: "土建工程",
    titleTail: "房建、市政与基础设施施工招标",
    intro: "土建工程类项目涵盖学校、医院、体育场馆等公共建筑，市政道路与公共空间，以及各类基础设施的施工与改扩建，多以工程或 EPC 方式招标。",
  },
  {
    slug: "healthcare",
    industry: "healthcare",
    name: "医疗",
    titleTail: "医院建设与医疗设备采购",
    intro: "医疗类项目包括医疗设备、医学影像与手术室设备、实验室设备和救护车的采购，以及医院与卫生中心的新建和改扩建。",
  },
  {
    slug: "ict",
    industry: "ict_telecom",
    name: "ICT与通信",
    titleTail: "光纤网络、安防与信息系统招标",
    intro: "ICT 与通信类项目包括光纤与通信网络建设、电信服务、数据中心、软件与信息系统、网络安全，以及视频监控等电子安防系统。",
  },
  {
    slug: "heavy-equipment",
    industry: "heavy_equipment",
    name: "工程机械",
    titleTail: "工程机械与重型设备采购",
    intro: "工程机械类项目以挖掘机、装载机、平地机、压路机、推土机等工程机械，以及起重机、沥青拌和站、混凝土搅拌车等重型设备的采购为主。",
  },
  {
    slug: "vehicles",
    industry: "vehicles",
    name: "车辆",
    titleTail: "卡车、客车、救护车与公务车辆采购",
    intro: "车辆类项目包括卡车、客车、皮卡、救护车、起重车等车辆的采购，以及公务车辆的购置。",
  },
];

export function getIndustryPage(slug: string): IndustryPage | undefined {
  return industryPages.find((page) => page.slug === slug);
}

export function industryPagePath(industry: string): string | undefined {
  const page = industryPages.find((item) => item.industry === industry);
  return page ? `/industries/${page.slug}` : undefined;
}
