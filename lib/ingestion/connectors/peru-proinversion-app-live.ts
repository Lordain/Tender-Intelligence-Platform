/**
 * ProInversión's public-private partnership (APP) portfolio — the projects
 * Peru tenders as concessions through its own concursos, which SEACE never
 * carries. investinperu.pe, the site the OxI connector reads.
 *
 * ── Two reads ────────────────────────────────────────────────────────────
 *
 * 1. The portfolio list: the multipart POST the "Portafolio APP" page makes
 *    (projectappService.php, 10 a page, 88 projects on 2026-10-10). JSON,
 *    one object per project: short and long name, sector, holder (Titular),
 *    investment without IGV in US$ millions, phase (Formulación →
 *    Estructuración → Transacción) and the estimated quarter of the award
 *    (Buena Pro).
 * 2. For a project in Transacción, its detail page's Cronograma — the one
 *    place that says when the call (Convocatoria / DI) was published. On
 *    2026-10-10 all six projects in Transacción had one, between March 2025
 *    and April 2026: they are concursos under way, not previews.
 *
 * The detail page also names the project director with an e-mail address.
 * Only the cronograma block is read from it; nothing about people is kept.
 *
 * Neither read states a bid deadline: the bases set it and circulars move
 * it. The mapper says so instead of inventing one.
 */

const ORIGIN = "https://www.investinperu.pe";
const PORTFOLIO_URL = `${ORIGIN}/wp-content/themes/hello-elementor-child/__api/service/app/projectappService.php`;
export const PROINVERSION_APP_PORTFOLIO_PAGE = `${ORIGIN}/portafolio-app/`;
export const proinversionAppDetailUrl = (slug: string) => `${ORIGIN}/portafolio-app/detalle/?${slug}`;

const USER_AGENT = "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; public-data ingestion)";
const TIMEOUT_MS = 60_000;
const PAGE_LIMIT = 10;
/** 88 projects on 2026-10-10; a ceiling well above that, so a changed endpoint cannot loop. */
const MAX_PAGES = 40;

/** The fields of one portfolio entry the platform reads. */
export type ProinversionAppProject = {
  Id: number;
  Slug: string;
  Nombre: string;
  NombreCorto: string;
  /** "En Cartera", "Adjudicado", … */
  Estado: string;
  /** "Formulación", "Estructuración", "Transacción", "Ejecución Contractual", … */
  Fase: string;
  Iniciativa: string;
  Modalidad: string;
  ModalidadContractual: string;
  Titular: string;
  Sector: string;
  /** US$ millions, without IGV. */
  MontoInversionSIGV: number | null;
  /** "IV TRIMESTRE 2026", "2029", "Por definir". */
  BuenaProPrevista: string;
  AnhoConcesion: number | null;
};

export type ScheduleStep = {
  /** "Convocatoria / DI", "Buena Pro", "Elaboración y aprobación de la VFC", … */
  step: string;
  /** As written: "23/12/2025" or "IV TRIMESTRE 2026". */
  when: string;
  /** YYYY-MM-DD when `when` is a full date. */
  date?: string;
  done: boolean;
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function textLines(html: string): string[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br|\/p|\/li|\/h\d|\/div|\/td|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * The Cronograma block of a detail page. It reads, line by line:
 *
 *   Cronograma · Formulación · Estructuración · Transacción     (the phase strip)
 *   Concluido · Encargo o Asignación del Sector · 28/01/2025
 *   Concluido · Convocatoria / DI · 23/12/2025
 *   Planificado · Buena Pro · IV TRIMESTRE 2026
 *   Últimos documentos …
 *
 * A state line opens each step. A step without one is not counted as done:
 * on Choquequirao's page "Elaboración y aprobación de la VFC · I TRIMESTRE
 * 2027" follows the Convocatoria with no state, and a quarter still ahead is
 * not a finished step.
 */
export function parseAppSchedule(html: string): ScheduleStep[] {
  const lines = textLines(html);
  const start = lines.findIndex((line, i) => line === "Cronograma" && lines[i + 1] === "Formulación");
  if (start < 0) return [];
  const end = lines.findIndex((line, i) => i > start && /^Últimos documentos|^Director/.test(line));
  const block = lines.slice(start + 1, end > start ? end : undefined).filter((line) => !/^(Formulación|Estructuración|Transacción)$/.test(line));

  const steps: ScheduleStep[] = [];
  let done = false;
  for (let i = 0; i < block.length; i += 1) {
    if (/^(Concluido|Planificado|En curso)$/.test(block[i])) {
      done = block[i] === "Concluido";
      continue;
    }
    const stated = i > 0 && /^(Concluido|Planificado|En curso)$/.test(block[i - 1]);
    if (!stated) done = false;
    const when = block[i + 1];
    if (!when || /^(Concluido|Planificado|En curso)$/.test(when)) continue;
    const day = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(when);
    steps.push({ step: block[i], when, ...(day ? { date: `${day[3]}-${day[2]}-${day[1]}` } : {}), done });
    i += 1;
  }
  return steps;
}

/** The date the call was published, when the schedule has one. */
export function convocatoriaDate(steps: ScheduleStep[]): string | undefined {
  return steps.find((step) => /^convocatoria/i.test(step.step) && step.date)?.date;
}

async function fetchPortfolioPage(page: number): Promise<ProinversionAppProject[]> {
  const form = new FormData();
  for (const [name, value] of [
    ["NombreProyecto", ""],
    ["TipoIniciativaList", ""],
    ["ModalidadList", ""],
    ["TipologiaList", ""],
    ["AnioList", ""],
    ["EstadoList", ""],
    ["Lan", "es"],
    ["Page", String(page)],
    ["PageLimit", String(PAGE_LIMIT)],
  ]) form.append(name, value);
  const response = await fetch(PORTFOLIO_URL, {
    method: "POST",
    body: form,
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "User-Agent": USER_AGENT,
      Origin: ORIGIN,
      Referer: PROINVERSION_APP_PORTFOLIO_PAGE,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ProInversión APP 列表返回 HTTP ${response.status} ${response.statusText}`);
  const payload = (await response.json()) as { Code?: number; Data?: ProinversionAppProject[] | null; Message?: string };
  if (payload.Code !== 1 || (payload.Data !== null && payload.Data !== undefined && !Array.isArray(payload.Data))) {
    throw new Error(`ProInversión APP 列表返回了意外内容：${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload.Data ?? [];
}

/** Every project in the portfolio, page by page, each once. */
export async function fetchAppPortfolio(): Promise<ProinversionAppProject[]> {
  const byId = new Map<number, ProinversionAppProject>();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = await fetchPortfolioPage(page);
    for (const row of rows) byId.set(row.Id, row);
    if (rows.length < PAGE_LIMIT) break;
  }
  return [...byId.values()];
}

export async function fetchAppSchedule(slug: string): Promise<ScheduleStep[]> {
  const response = await fetch(proinversionAppDetailUrl(slug), {
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-PE,es;q=0.9", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ProInversión 项目页返回 HTTP ${response.status}：${slug}`);
  return parseAppSchedule(await response.text());
}
