/**
 * 「按内容选页」(user, 2026-10-16: 不按某个固定标题找，而是按内容给每页打分，
 * 挑最相关的 N 页 → 后台增加这种方案，我试用看看效果) — an opt-in on 本地批量分析.
 *
 * The page cap (maxPagesForTier: 20 / 30 / 40) reads a document from page 1.
 * Where the requirements come late that reads nothing: Peru's
 * LP-SM-2-2026-MDLCH-1 is 113 pages whose first 19 are the OECE bases'
 * common provisions, identical in every tender, and its 常规 20 pages came
 * back 0/0/0/0. Each country names its sections differently, so instead of
 * a heading this scores every page by what the analysis extracts —
 * qualification, experience, required documents, guarantees, penalties,
 * evaluation — in Spanish, Portuguese and English, plus the concrete
 * figures (amounts, percentages, days) that a tender's own conditions carry
 * and common provisions do not. Then it keeps the N best pages, in document
 * order. Same N, same cost.
 *
 * The analysis also writes the 一句话总结 (user, 2026-10-16: 因为我们除了标书
 * 要求，还需要一句话总结), so what the project IS has to be read too: the
 * first two pages (cover, the call's own data) are always kept, and two more
 * go to the pages that best describe the object, scope, location, value
 * and term; the rest go to the requirements.
 *
 * Cost (user, 2026-10-16: 确保成本不变): never more pages than the first N,
 * and never more text — the selected pages together stay within the
 * characters the first N pages had, the lowest-scoring dropped until they
 * do. A table of contents, which names every heading, scores nothing. A
 * document with no signal at all reads from page 1 as before.
 */

const STRONG = [
  // Spanish
  "requisitos de calificacion", "requisitos habilitantes", "requisitos minimos", "experiencia del postor", "experiencia en la especialidad",
  "experiencia en obras similares", "experiencia especifica", "experiencia general", "capacidad tecnica", "capacidad legal", "capacidad financiera",
  "capacidad economica", "capacidad residual", "personal clave", "plantel profesional", "equipamiento estrategico", "equipo minimo",
  "documentos de presentacion obligatoria", "documentacion de presentacion obligatoria", "documentos para la admision", "documentos habilitantes",
  "contenido de la oferta", "contenido de las ofertas", "factores de evaluacion", "criterios de evaluacion", "metodologia de evaluacion",
  "condiciones de participacion", "acreditacion", "garantia de seriedad", "garantia de fiel cumplimiento", "garantia de cumplimiento",
  "penalidad", "multas", "indicadores financieros", "indice de liquidez", "nivel de endeudamiento",
  // Portuguese
  "habilitacao juridica", "qualificacao tecnica", "qualificacao economico-financeira", "regularidade fiscal", "atestado de capacidade tecnica",
  "atestados", "documentos de habilitacao", "requisitos de habilitacao", "capacidade tecnico-operacional", "capacidade tecnico-profissional",
  "garantia contratual", "sancoes administrativas", "criterio de julgamento",
  // English
  "qualification requirements", "eligibility criteria", "experience requirements", "similar contracts", "bid security", "performance security",
  "liquidated damages", "evaluation criteria", "key personnel", "financial capacity",
];

const WEAK = [
  "experiencia", "acreditar", "debera presentar", "deberan presentar", "copia de", "constancia", "certificado", "consorcio", "plazo de ejecucion",
  "visita", "garantia", "deve apresentar", "prazo de execucao", "must submit", "certificate",
];

/** What the project is: object, scope, location, value, term — what the 一句话总结 is written from. */
const PROJECT = [
  "objeto de la contratacion", "objeto de la convocatoria", "objeto del contrato", "objeto del proceso", "descripcion del proyecto",
  "descripcion de la obra", "alcance de la obra", "alcance del servicio", "alcances", "ubicacion", "valor referencial", "valor estimado",
  "presupuesto referencial", "presupuesto oficial", "monto referencial", "plazo de ejecucion", "fuente de financiamiento", "antecedentes",
  "objeto da licitacao", "objeto da contratacao", "do objeto", "valor estimado", "descricao do objeto", "prazo de vigencia", "local de entrega",
  "local de execucao", "justificativa",
  "scope of works", "scope of supply", "project description", "contract price", "location of the works",
];

/** A keyword counts at most this many times on one page, so one repeated word cannot carry a page. */
const KEYWORD_CAP = 4;
/** Below this, no page says anything the analysis looks for: keep the old first-N behaviour. */
const MIN_SIGNAL = 6;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

function occurrences(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at >= 0 && count < KEYWORD_CAP; at = text.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/** A table of contents: titled as one, or several lines ending in dot leaders and a page number. */
export function isIndexPage(text: string): boolean {
  if (/^\s*[ÍI]NDICE\b|^\s*SUM[ÁA]RIO\b|^\s*TABLE OF CONTENTS\b|^\s*CONTENIDO\s*$/im.test(text)) return true;
  return (text.match(/(?:\.{4,}|…{2,}|_{4,})\s*\d{1,3}\s*$/gm) ?? []).length >= 4;
}

export type PageScore = { page: number; score: number; projectScore: number; keywords: string[] };

/** How much a page says about what the project is — the 一句话总结's material. */
export function scoreProjectPage(text: string): number {
  if (text.trim().length < 150 || isIndexPage(text)) return 0;
  const plain = normalize(text);
  return PROJECT.reduce((sum, word) => sum + occurrences(plain, word), 0);
}

export function scorePage(text: string): { score: number; keywords: string[] } {
  if (text.trim().length < 150 || isIndexPage(text)) return { score: 0, keywords: [] };
  const plain = normalize(text);
  const keywords: string[] = [];
  let score = 0;
  for (const word of STRONG) {
    const hits = occurrences(plain, word);
    if (hits > 0) {
      score += 3 * hits;
      keywords.push(word);
    }
  }
  for (const word of WEAK) score += occurrences(plain, word);
  // The tender's own figures: amounts, percentages, periods.
  score += Math.min(6, (plain.match(/(?:s\/\.?|us\$|usd|r\$|bs\.?|\$)\s?\d[\d.,]{3,}/g) ?? []).length);
  score += 0.5 * Math.min(6, (plain.match(/\d+(?:[.,]\d+)?\s?%/g) ?? []).length);
  score += Math.min(4, (plain.match(/\d+\s*(?:\(\w+\)\s*)?(?:dias|meses|anos)\b/g) ?? []).length);
  return { score, keywords };
}

export type PageSelection = {
  /** 0-based page indexes to send, in document order. */
  pages: number[];
  /** For the operator: which pages were read, or null when nothing changed from the first N. */
  note: string | null;
  scores: PageScore[];
};

/** "1–2, 20–24, 45" from 1-based page numbers. */
export function pageRanges(pages: number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`);
  }
  return parts.join(", ");
}

/** How many pages, after the first two, are kept for what the project is. */
const PROJECT_PAGES = 2;

/**
 * budget "chars" (the text path): never more characters than the first N
 * pages. "pages" (a scan, read as images): the page count is the cost, and
 * a page's OCR length says nothing about it.
 */
export function selectRelevantPages(pageTexts: string[], maxPages: number, options: { budget?: "chars" | "pages" } = {}): PageSelection {
  const raw = pageTexts.map((text, page) => ({ page, ...scorePage(text), projectScore: scoreProjectPage(text) }));
  const all = pageTexts.map((_, page) => page);
  if (pageTexts.length <= maxPages) return { pages: all, note: null, scores: raw };
  const firstN = all.slice(0, maxPages);
  if (Math.max(0, ...raw.map((entry) => entry.score)) < MIN_SIGNAL) return { pages: firstN, note: null, scores: raw };

  // A section runs over several pages and its continuation is less dense
  // than its heading page: a page borrows a little from its neighbours.
  const smoothed = raw.map((entry, i) => ({
    page: entry.page,
    score: entry.score === 0 ? 0 : entry.score + 0.3 * ((raw[i - 1]?.score ?? 0) + (raw[i + 1]?.score ?? 0)),
  }));
  const always = all.slice(0, Math.min(2, maxPages));
  const project = raw
    .filter((entry) => !always.includes(entry.page) && entry.projectScore > 0)
    .sort((a, b) => b.projectScore - a.projectScore || a.page - b.page)
    .slice(0, Math.max(0, Math.min(PROJECT_PAGES, maxPages - always.length)))
    .map((entry) => entry.page);
  const ranked = smoothed
    .filter((entry) => !always.includes(entry.page) && !project.includes(entry.page) && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .map((entry) => entry.page);
  const chosen = [...always, ...project, ...ranked.slice(0, Math.max(0, maxPages - always.length - project.length))];

  // Never more text than the first N pages: drop the weakest requirement
  // pages until the selection fits the characters the old cap sent.
  const budget = options.budget === "pages" ? Infinity : firstN.reduce((sum, page) => sum + pageTexts[page].length, 0);
  let used = chosen.reduce((sum, page) => sum + pageTexts[page].length, 0);
  // Weakest requirement page first; the project pages only if that is not enough.
  const droppable = [...project, ...chosen.filter((page) => !always.includes(page) && !project.includes(page))];
  while (used > budget && droppable.length > 0) {
    const weakest = droppable.pop()!;
    chosen.splice(chosen.indexOf(weakest), 1);
    used -= pageTexts[weakest].length;
  }
  const pages = chosen.sort((a, b) => a - b);
  const unchanged = pages.length === firstN.length && pages.every((page, i) => page === firstN[i]);
  return {
    pages,
    note: unchanged ? null : `按内容选页：读了第 ${pageRanges(pages.map((page) => page + 1))} 页（共 ${pageTexts.length} 页；原来只读前 ${maxPages} 页）`,
    scores: raw,
  };
}
