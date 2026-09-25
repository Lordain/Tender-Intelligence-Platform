/**
 * Live read of Cemig's e-Compras portal (app2-compras.cemig.com.br) for every
 * process currently published and open for proposals.
 *
 * ── Why Cemig and not PNCP ───────────────────────────────────────────────
 *
 * Cemig (Companhia Energética de Minas Gerais, and its distribution and
 * generation/transmission subsidiaries) buys under Lei 13.303 on its own
 * platform. Its grid equipment — towers, insulators, transformers — is bought
 * there and nowhere else this site reads.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * The portal's public search (/pesquisa, no login) is a React app over a
 * JSON API, and the API answers without a session:
 *
 *   POST https://api-manager-compras.cemig.com.br/auction-notice/doSearchAuctionNotice
 *        {"filter":{…,"biddingStageId":8},"offset":N}   → 20 per page, meta.count
 *   POST https://api-manager-compras.cemig.com.br/auction-notice/getAuctionNoticeById
 *        {"auctionId":id}                                → the process: rule, segments, dates
 *
 * Stage 8 is "PUBLICADO": published and taking proposals (22 processes on
 * 2026-09-25, out of 1,351 in the whole history). Later stages are the
 * dispute, the decision and the contract — none of them biddable. The
 * search filter is the site's own (its search screen sends biddingStageId),
 * so one run is two list pages plus one detail request per process.
 *
 * The edital itself is a public zip: https://arquivos-compras.cemig.com.br/<auctionFile>
 * (the 21952 transmission-tower edital was 79 MB, served with no session).
 *
 * No amounts: the API has no value field for a published process.
 */

const API_ORIGIN = "https://api-manager-compras.cemig.com.br";
const FILES_ORIGIN = "https://arquivos-compras.cemig.com.br";
const PORTAL_ORIGIN = "https://app2-compras.cemig.com.br";

/** biddingStageId for "PUBLICADO". */
const STAGE_PUBLISHED = 8;
const PAGE_SIZE = 20;
/** A ceiling against a filter that stops filtering, not an expected size: 22 open on 2026-09-25. */
const MAX_PAGES = 15;

const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

/** One row of doSearchAuctionNotice — only the fields this repo reads. */
export type CemigListRow = {
  id: number;
  auctionType: string;
  auctionNumber: string;
  simpleDescription: string;
  auctionFile: string | null;
  biddingStageId: number;
  auctionCanceled: number;
  auctionFinished: number;
  organizationUnitName: string;
  startDateTimeDispute: string | null;
};

/** getAuctionNoticeById's `data` — only the fields this repo reads. */
export type CemigDetail = {
  processNumber: string;
  simpleDescription: string;
  publishedDate: string | null;
  startDateTimeDispute: string | null;
  startDateTimeToSendProposal: string | null;
  endDateTimeToSendProposal: string | null;
  isCanceled: boolean;
  isFinished: boolean;
  rule: { description: string } | null;
  legalSupport: { description: string } | null;
  stage: { id: number; stageName: string } | null;
  segments: { categoryName: string }[] | null;
  organizationUnit?: { organizationUnitName?: string } | null;
  judgeCriterion?: { description: string } | null;
};

export type CemigProcess = { row: CemigListRow; detail: CemigDetail };

export function cemigProcessUrl(id: number): string {
  return `${PORTAL_ORIGIN}/processos/${id}`;
}

export function cemigEditalUrl(auctionFile: string): string {
  return `${FILES_ORIGIN}/${encodeURIComponent(auctionFile)}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Cemig ${path} 返回 HTTP ${response.status} ${response.statusText}`);
  const json = (await response.json()) as { status?: string; data?: unknown; meta?: { count?: number } };
  if (json.status !== "success" || json.data === undefined) throw new Error(`Cemig ${path} 没有返回 status=success —— 接口可能改了`);
  return json as T;
}

/** Every published process with its detail. Throws when the list's shape changes, rather than reading that as "nothing open". */
export async function fetchCemigPublishedProcesses(onProgress?: (message: string) => void): Promise<CemigProcess[]> {
  const rows: CemigListRow[] = [];
  let count: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await post<{ data: CemigListRow[]; meta?: { count?: number } }>("/auction-notice/doSearchAuctionNotice", {
      filter: { search: "", startDate: 0, startDatePublication: 0, isMarketplace: 0, biddingStageId: STAGE_PUBLISHED },
      offset: page * PAGE_SIZE,
    });
    if (!Array.isArray(answer.data)) throw new Error("Cemig 搜索接口的 data 不是数组 —— 格式可能变了");
    count ??= answer.meta?.count;
    rows.push(...answer.data);
    if (answer.data.length < PAGE_SIZE || (count !== undefined && rows.length >= count)) break;
  }
  // The filter is the whole reason one run is two requests; if it stopped
  // being honoured this would be reading 1,351 historical processes.
  const leaked = rows.filter((row) => row.biddingStageId !== STAGE_PUBLISHED);
  if (leaked.length > 0) throw new Error(`Cemig 搜索接口返回了 ${leaked.length} 条非「已发布」阶段的流程 —— biddingStageId 过滤可能失效了`);
  onProgress?.(`Cemig 已发布流程 ${rows.length} 个（接口说共 ${count ?? "?"} 个）`);

  const processes: CemigProcess[] = [];
  for (const row of rows) {
    const answer = await post<{ data: CemigDetail }>("/auction-notice/getAuctionNoticeById", { auctionId: row.id });
    processes.push({ row, detail: answer.data });
  }
  return processes;
}
