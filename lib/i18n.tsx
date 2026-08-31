"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Locale, LocalizedText } from "@/types/tender";

const LOCALE_STORAGE_KEY = "tender-intelligence:locale";
const LOCALES: Locale[] = ["en", "es", "zh"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  zh: "中文",
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && LOCALES.includes(stored as Locale)) {
      // Deliberately syncing from localStorage post-mount to avoid an SSR/client hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(stored as Locale);
    }
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

export function localize(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

export const uiText = {
  tagline: {
    en: "Discover. Understand. Qualify.",
    es: "Descubre. Comprende. Califica.",
    zh: "发现·理解·资格判断",
  },
  heroTitle: {
    en: "Tender intelligence for teams that bid to win",
    es: "Inteligencia de licitaciones para equipos que buscan ganar",
    zh: "为志在中标的团队提供招投标情报",
  },
  heroSubtitle: {
    en: "Search Mexican government tenders, understand qualification requirements in minutes, and decide bid or no-bid with confidence.",
    es: "Busca licitaciones del gobierno mexicano, comprende los requisitos de calificación en minutos y decide si participar con confianza.",
    zh: "检索墨西哥政府招标信息，几分钟内理解资格要求，自信地判断是否值得投标。",
  },
  browseTenders: {
    en: "Browse Tenders",
    es: "Ver Licitaciones",
    zh: "浏览招标",
  },
  featuredTenders: {
    en: "Recently Published",
    es: "Publicadas Recientemente",
    zh: "近期发布",
  },
  navHome: { en: "Home", es: "Inicio", zh: "首页" },
  navTenders: { en: "Tenders", es: "Licitaciones", zh: "招标" },
  searchPlaceholder: {
    en: "Search by tender name, buyer, or ID…",
    es: "Buscar por nombre, comprador o ID…",
    zh: "按名称、采购人或编号搜索…",
  },
  industryLabel: { en: "Industry", es: "Industria", zh: "行业" },
  scopeLabel: { en: "Scope", es: "Alcance", zh: "标的类型" },
  statusLabel: { en: "Status", es: "Estado", zh: "状态" },
  allIndustries: { en: "All Industries", es: "Todas las Industrias", zh: "全部行业" },
  allScopes: { en: "All Scopes", es: "Todos los Alcances", zh: "全部类型" },
  allStatuses: { en: "All Statuses", es: "Todos los Estados", zh: "全部状态" },
  resultsCount: {
    en: "tenders found",
    es: "licitaciones encontradas",
    zh: "条招标结果",
  },
  noResults: {
    en: "No tenders match your filters.",
    es: "Ninguna licitación coincide con tus filtros.",
    zh: "没有符合筛选条件的招标。",
  },
  estimatedValue: { en: "Estimated Value", es: "Valor Estimado", zh: "预估金额" },
  submissionDeadline: {
    en: "Submission Deadline",
    es: "Fecha Límite de Presentación",
    zh: "提交截止日期",
  },
  viewDetails: { en: "View Details", es: "Ver Detalles", zh: "查看详情" },
  backToTenders: { en: "Back to Tenders", es: "Volver a Licitaciones", zh: "返回招标列表" },
  notFoundTitle: { en: "Tender not found", es: "Licitación no encontrada", zh: "未找到该招标" },
  notFoundBody: {
    en: "This tender may have been removed or the link is incorrect.",
    es: "Es posible que esta licitación haya sido eliminada o que el enlace sea incorrecto.",
    zh: "该招标可能已被移除，或链接有误。",
  },
  overview: { en: "Overview", es: "Resumen", zh: "概览" },
  buyer: { en: "Buyer", es: "Comprador", zh: "采购人" },
  governmentLevelLabel: { en: "Government Level", es: "Nivel de Gobierno", zh: "政府层级" },
  procedureType: { en: "Procedure Type", es: "Tipo de Procedimiento", zh: "采购方式" },
  locationLabel: { en: "Location", es: "Ubicación", zh: "地点" },
  publicationDateLabel: { en: "Publication Date", es: "Fecha de Publicación", zh: "发布日期" },
  qualifications: { en: "Qualification Requirements", es: "Requisitos de Calificación", zh: "资质要求" },
  experienceRequirements: { en: "Experience Requirements", es: "Requisitos de Experiencia", zh: "经验要求" },
  requiredDocuments: { en: "Required Documents", es: "Documentos Requeridos", zh: "所需文件" },
  criticalDates: { en: "Critical Dates", es: "Fechas Críticas", zh: "关键日期" },
  risks: { en: "Risks", es: "Riesgos", zh: "风险提示" },
  source: { en: "Source", es: "Fuente", zh: "来源" },
  mandatory: { en: "Mandatory", es: "Obligatorio", zh: "强制要求" },
  optional: { en: "Optional", es: "Opcional", zh: "非强制" },
  viewSourceDocument: { en: "View source document", es: "Ver documento fuente", zh: "查看原始来源文件" },
  noneListed: { en: "None listed for this tender.", es: "No se enlistan para esta licitación.", zh: "本项目未列出相关内容。" },
} satisfies Record<string, LocalizedText>;
