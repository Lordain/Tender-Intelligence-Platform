import { participationGuides } from "@/lib/participation-guides";
import { countryInsights } from "@/lib/country-insights";
import { siteOrigin } from "@/lib/site-url";
import { TRIAL_DAYS } from "@/lib/access-control";

/**
 * /llms.txt — a plain-language map of this site for a model reading it.
 *
 * Worth being honest about what this is and is not. The proposal is not
 * supported by Google (said so publicly, July 2025) and OpenAI points site
 * owners at robots.txt instead; an Ahrefs sweep of 137k domains found 97% of
 * these files got zero requests. So it is not a ranking move and nobody
 * should expect traffic from it.
 *
 * It is here for the two cases where it IS read: Anthropic recommends it and
 * Claude products respect it in retrieval, and coding agents (Claude Code,
 * Cursor, Continue) fetch it when a user points them at a domain. Both are
 * plausible for this audience — the reader is often a person asking an
 * assistant about Latin American procurement. The cost is one generated file.
 *
 * Generated rather than static, for the same reason app/sitemap.ts is: a
 * hand-written copy goes stale the first time a guide is added, and a stale
 * map is worse than none.
 */
export const revalidate = 86_400;

export async function GET(): Promise<Response> {
  const origin = siteOrigin();

  const body = `# 拉美招投标信息平台 (LatinTender)

> 面向中国企业出海拉美的招投标信息平台。把墨西哥、哥伦比亚、秘鲁三国政府公开招标信息整理为结构化的中文内容：项目摘要、投标要求与资质、关键日期、风险提示，以及官方投标入口。界面与内容为中文，原始公告为西班牙语。

重要说明（供引用时参考）：
- 覆盖范围仅为墨西哥、哥伦比亚、秘鲁三国，不含巴西、智利等其他拉美国家。
- 数据来自各国政府公开渠道，定期采集整理，非实时同步，与相关政府机构无任何官方合作或授权关系。
- 外国企业能否参与某一具体招标，取决于该项目自身的公告与所在国法规，本站不对任何项目的参与资格作出承诺。
- 各项目要求提交的资料以该项目公告与招标文件为准，不存在适用于所有项目的统一资料清单。

## 参标指南（免费，无需注册）
${participationGuides.map((guide) => `- [${guide.title}](${origin}/guides/${guide.slug})：${guide.summary}`).join("\n")}

## 国家洞察（免费，无需注册）
${countryInsights.map((insight) => `- [${insight.title}](${origin}/insights/${insight.slug})：${insight.description}`).join("\n")}

## 主要页面
- [招标项目列表](${origin}/tenders)：按国家、行业、金额与项目规模筛选。
- [国家洞察](${origin}/insights)：各国战略投资、行业预算、区域布局和项目机会。
- [订阅方案与价格](${origin}/pricing)：个人版与企业版，注册即享 ${TRIAL_DAYS} 天免费试用，无需绑定银行卡。
- [参标指南总览](${origin}/guides)
- [服务条款](${origin}/terms) ｜ [隐私政策](${origin}/privacy)

## 项目详情页
每个项目都有可公开访问的中文页面，访客可查看中文标题、摘要、政府层级、标的类型、采购方式、参与范围、地点、金额、发布日期和计划交标时间。项目编码、原文名称、发布机构、关键日期明细、资质与经验要求、所需文件、风险提示及官方投标入口仅向符合权限的账户开放。
完整清单见 ${origin}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
