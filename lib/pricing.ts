import type { LocalizedText } from "@/types/tender";

export type PricingTier = {
  id: "explorer" | "professional" | "enterprise";
  name: LocalizedText;
  price: LocalizedText;
  period: LocalizedText;
  description: LocalizedText;
  features: LocalizedText[];
  cta: LocalizedText;
  highlighted?: boolean;
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "explorer",
    name: { en: "Explorer", es: "Explorer", zh: "探索版" },
    price: { en: "$199", es: "$199", zh: "$199" },
    period: { en: "/ month", es: "/ mes", zh: "/ 月" },
    description: {
      en: "For teams starting to track opportunities in Mexico.",
      es: "Para equipos que empiezan a rastrear oportunidades en México.",
      zh: "适合刚开始关注墨西哥招标机会的团队。",
    },
    features: [
      { en: "Tender database search", es: "Búsqueda en la base de datos de licitaciones", zh: "招标数据库搜索" },
      { en: "Basic industry/scope/status filters", es: "Filtros básicos de industria/alcance/estado", zh: "基础行业/类型/状态筛选" },
      { en: "Last 3 months of tenders", es: "Licitaciones de los últimos 3 meses", zh: "近3个月的招标数据" },
      { en: "Basic tender summary", es: "Resumen básico de licitación", zh: "基础招标摘要" },
      { en: "Up to 3 saved searches", es: "Hasta 3 búsquedas guardadas", zh: "最多3个已保存搜索" },
    ],
    cta: { en: "Get Started", es: "Comenzar", zh: "立即开始" },
  },
  {
    id: "professional",
    name: { en: "Professional", es: "Professional", zh: "专业版" },
    price: { en: "$599–$999", es: "$599–$999", zh: "$599–$999" },
    period: { en: "/ month", es: "/ mes", zh: "/ 月" },
    description: {
      en: "For teams that actively bid and need full analysis.",
      es: "Para equipos que licitan activamente y necesitan análisis completo.",
      zh: "适合积极投标、需要完整分析的团队。",
    },
    features: [
      { en: "Everything in Explorer", es: "Todo lo del plan Explorer", zh: "包含探索版全部功能" },
      { en: "Curated feed of significant projects, not everything", es: "Selección curada de proyectos significativos, no todo", zh: "精选大型/重点项目，而非全部招标信息" },
      { en: "Full qualification analysis", es: "Análisis completo de calificación", zh: "完整资质分析" },
      { en: "Experience requirements & required documents", es: "Requisitos de experiencia y documentos requeridos", zh: "经验要求与所需文件" },
      { en: "Critical dates & risk flags", es: "Fechas críticas y alertas de riesgo", zh: "关键日期与风险提示" },
      { en: "Tender alerts", es: "Alertas de licitaciones", zh: "招标提醒" },
      { en: "Full historical tenders & export", es: "Historial completo y exportación", zh: "完整历史招标与导出" },
      { en: "All industries", es: "Todas las industrias", zh: "全部行业" },
    ],
    cta: { en: "Get Started", es: "Comenzar", zh: "立即开始" },
    highlighted: true,
  },
  {
    id: "enterprise",
    name: { en: "Enterprise", es: "Enterprise", zh: "企业版" },
    price: { en: "$2,000+", es: "$2,000+", zh: "$2,000+" },
    period: { en: "/ month", es: "/ mes", zh: "/ 月" },
    description: {
      en: "For organizations that need scale, API access, and intelligence across Latin America.",
      es: "Para organizaciones que necesitan escala, acceso a API e inteligencia en toda Latinoamérica.",
      zh: "适合需要拉美多国规模化覆盖、API接入与深度情报的企业。",
    },
    features: [
      { en: "Everything in Professional", es: "Todo lo del plan Professional", zh: "包含专业版全部功能" },
      { en: "Multiple users & company profile", es: "Múltiples usuarios y perfil de empresa", zh: "多用户与企业档案" },
      { en: "API access", es: "Acceso a API", zh: "API接入" },
      { en: "Advanced intelligence & competitor data", es: "Inteligencia avanzada y datos de competidores", zh: "高级情报与竞争对手数据" },
      { en: "Custom alerts", es: "Alertas personalizadas", zh: "定制提醒" },
      { en: "Historical award data", es: "Datos históricos de adjudicación", zh: "历史中标数据" },
      { en: "Private workspace, SSO & audit controls", es: "Espacio privado, SSO y controles de auditoría", zh: "私有工作区、SSO与审计控制" },
    ],
    cta: { en: "Contact Sales", es: "Contactar Ventas", zh: "联系销售" },
  },
];
