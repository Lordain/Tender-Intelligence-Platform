import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeEgressDenial, egressDenial } from "@/lib/ingestion/egress-denial";
import { describeFetchFailure } from "@/lib/fetch-failure";

/**
 * Knocking on Chile's doors, before anybody writes a Chilean connector.
 *
 * ── What this is, and what it is NOT ──────────────────────────────────────
 *
 * Every URL in the list below is a HYPOTHESIS. Not one of them has been
 * confirmed to exist by this file's author, and several are spelling guesses
 * at an endpoint that may be spelled otherwise or may not exist at all. That
 * is deliberate and it is the whole job: `probe:chile-doors` is how the
 * guesses get replaced by measurements, in the same order the Brazil, ANTAQ
 * and DOU sources were built — probe first, code second, and twice the probe
 * changed the plan entirely.
 *
 * So the report this produces MUST read as "here is what answered", never as
 * "here is Chile's API". A door marked 通 is a measurement. A door in this
 * list that has never been knocked on is a sentence someone typed.
 *
 * ── The four verdicts that must never merge ───────────────────────────────
 *
 * README.md's standing rule is that unreachable ≠ empty ≠ not-yet-published.
 * This probe adds the fourth state that broke the Chile round on 2026-09-24
 * and looks exactly like the other three from a status code:
 *
 *   egress_denied   our own container refused to let the request out. Says
 *                   NOTHING about Chile. See lib/ingestion/egress-denial.ts.
 *   unreachable     the socket never got an answer — DNS, TLS, reset, timeout.
 *   refused         Chile answered, with a refusal. A fact about the source.
 *   answered        Chile answered with content. The only measurement.
 *
 * `empty` sits under `answered` on purpose: a feed that answers with zero
 * rows has told us something real (nothing published in that window), and
 * folding it into a failure is how a working source gets written off.
 *
 * ── The credential question, and why this probe stops rather than solves ──
 *
 * Mercado Público's API is understood to require a `ticket` (an API key) on
 * its `/servicios/v1/publico/…` paths. That understanding is RECALLED, not
 * measured — which is exactly why door C1 asks without one: the refusal it
 * gets back is the measurement of what is required, and the operator's own
 * error message is better evidence than anybody's memory.
 *
 * If a ticket turns out to be required, this code does not acquire one, work
 * around one, or pretend to be a browser to avoid needing one. Registering
 * for a government API key is the platform owner's decision and may carry
 * terms; the probe's job is to report the requirement and where it is
 * requested. `CHILE_MERCADOPUBLICO_TICKET` is read from the environment ONLY
 * if the owner has already put one there.
 */

const HEADERS = {
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-CL,es;q=0.9",
  // Same posture as every other connector here: a real product name and a
  // contact URL, so a public open-data operator can see who is calling and
  // throttle this caller specifically. Nothing here claims to be Chrome —
  // browser impersonation is not on the table for this repo, and on the
  // .gob.pe WAF being honest is what actually worked.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

export type DoorVerdict =
  | "egress_denied"
  | "unreachable"
  | "refused"
  | "credential_required"
  | "block_page"
  | "answered"
  | "answered_empty";

export type Door = {
  id: string;
  /** Written for the person reading the report, in Chinese like the rest of the operator-facing output. */
  what: string;
  url: string;
  /**
   * How sure we are the URL exists at all, stated per door so the report can
   * never present a guess as a finding.
   *
   * "guess" means the path was written from memory and may simply be wrong —
   * a 404 from such a door is evidence about the SPELLING, not about Chile.
   * "control" means the door exists to calibrate the prober itself.
   */
  confidence: "guess" | "documented-elsewhere" | "control";
  /** Set when the door is only meaningful with a ticket the owner supplied. */
  needsTicket?: boolean;
};

export type DoorResult = Door & {
  verdict: DoorVerdict;
  /** One line of evidence — the body, the title, the column names, the refusal. */
  detail: string;
  ms: number;
  status: number | null;
  /** Kept so the caller can save a real payload as a fixture. Undefined when nothing was received. */
  body?: string;
  contentType?: string | null;
};

/**
 * Three controls answering TWO different questions, and the difference is the
 * whole reason the report can be trusted.
 *
 * C0 asks: does this prober have any network at all? C0b and C0c ask a much
 * sharper question — can this machine reach the government open-data hosts
 * this platform ALREADY imports from in production, every day? Those two are
 * the meaningful control for Chile, because they are the same kind of host on
 * the same kind of path.
 *
 * The first run of this probe (2026-09-24) is exactly why they are split.
 * C0 passed and C0b/C0c were both refused by the local egress gateway, and
 * a first version of the summary below read that as "1 / 3 通。探针自己的网络
 * 是好的，下面的结果可以当数据读" — which is false, and false in the most
 * expensive direction available: it invites a reader to treat thirteen
 * un-sent requests as thirteen findings about Chile.
 */
const REACHABILITY_CONTROL = "C0";

const CONTROLS: Door[] = [
  { id: REACHABILITY_CONTROL, confidence: "control", what: "对照 A：一个已知能连的主机（只证明探针进程有网，不证明别的）", url: "https://github.com/" },
  { id: "C0b", confidence: "control", what: "★ 对照 B：巴西 PNCP —— 生产环境每天在用的源，和智利是同一类主机", url: "https://pncp.gov.br/api/search?q=ponte&tipos_documento=edital&pagina=1&tam_pagina=10" },
  { id: "C0c", confidence: "control", what: "★ 对照 B：秘鲁 OECE —— 生产环境每天在用的源，和智利是同一类主机", url: "https://contratacionesabiertas.oece.gob.pe/api/v1/files?page=1" },
];

/**
 * The Chilean doors.
 *
 * Grouped by the question each one answers, because a flat list of URLs
 * invites the reader to treat the first 200 as the answer. The questions are
 * the task's: where is the door, does it need credentials, what does one row
 * look like, and how much is there.
 */
const CHILE_DOORS: Door[] = [
  // ── ChileCompra / Mercado Público: the working hypothesis ───────────────
  //
  // C1 asks with NO ticket on purpose. Whatever comes back is the answer to
  // "does it need credentials" — in the operator's own words rather than in
  // anybody's recollection. A 401, a 403 carrying a Spanish message about a
  // ticket, or a 200 with an error envelope are three different findings and
  // the detail line keeps them apart.
  {
    id: "C1",
    confidence: "documented-elsewhere",
    what: "★ Mercado Público 招标列表接口 —— 不带 ticket 问，就是为了看它要不要凭证",
    url: "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json",
  },
  {
    id: "C1b",
    confidence: "guess",
    what: "同上，按日期取一天（fecha=ddmmyyyy 的拼法是回忆的，可能不对）",
    url: "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=01092026",
  },
  {
    id: "C1c",
    confidence: "documented-elsewhere",
    what: "★ 同一接口，带上 owner 自己配的 ticket（没配就跳过，不去弄一个）",
    url: "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?estado=activas",
    needsTicket: true,
  },
  // ── An OCDS door, if one exists ─────────────────────────────────────────
  //
  // Chile was an early adopter of the Open Contracting Data Standard, and
  // this repo already has a working OCDS mapper (lib/ingestion/ocds-mapper.ts,
  // used by Colombia and Peru). If any of these answer, the mapper cost for
  // Chile drops to nearly nothing — which is why three spellings are tried
  // rather than one. All three are guesses.
  { id: "C2", confidence: "guess", what: "OCDS 接口猜法 1（apis. 这个二级域名是猜的）", url: "https://apis.mercadopublico.cl/OCDS/data/listaA%C3%B1oMes/2026/09" },
  { id: "C2b", confidence: "guess", what: "OCDS 接口猜法 2（同主机下的 /OCDS 路径）", url: "https://api.mercadopublico.cl/OCDS/data/listaAnoMes/2026/09" },
  { id: "C2c", confidence: "guess", what: "OCDS 接口猜法 3（标准里常见的 record package 路径）", url: "https://api.mercadopublico.cl/OCDS/data/record/2026" },
  // ── The national open-data catalogue ────────────────────────────────────
  //
  // datos.gob.cl is believed to run CKAN, and this repo already has a
  // hostname-free CKAN client (lib/ingestion/connectors/ckan.ts) that was
  // written against CKAN's published Action API rather than against any one
  // portal. `status_show` is the cheapest possible "is this CKAN" question
  // and its answer names the version — so this door either hands us a whole
  // ready-made read path or rules one out in one request.
  { id: "C3", confidence: "documented-elsewhere", what: "★ 智利国家开放数据门户是不是 CKAN（是的话仓库里的 ckan.ts 直接能用）", url: "https://datos.gob.cl/api/3/action/status_show" },
  { id: "C3b", confidence: "guess", what: "在目录里搜「licitaciones」，看有没有招标数据集", url: "https://datos.gob.cl/api/3/action/package_search?q=licitaciones&rows=5" },
  { id: "C3c", confidence: "guess", what: "在目录里搜「ChileCompra」，按发布机构找", url: "https://datos.gob.cl/api/3/action/package_search?q=chilecompra&rows=5" },
  // ── The human-facing sites ──────────────────────────────────────────────
  //
  // Asked last and worth least. A portal that answers HTML tells us the host
  // is alive and that a person can read it; it does not give a connector
  // anything to parse that would survive a redesign. Their real value is
  // negative evidence: if these are shut too, the whole domain is unreachable
  // rather than just the API path being wrong.
  { id: "C4", confidence: "documented-elsewhere", what: "Mercado Público 门户首页（只为判断主机活着没）", url: "https://www.mercadopublico.cl/" },
  { id: "C4b", confidence: "documented-elsewhere", what: "ChileCompra 机构站（凭证在哪儿申请，通常写在这儿）", url: "https://www.chilecompra.cl/" },
];

export const ALL_CHILE_DOORS: Door[] = [...CONTROLS, ...CHILE_DOORS];

const TIMEOUT_MS = 20_000;

/**
 * Reads a JSON body for the two things a mapper is written from: how many
 * rows there are, and what the fields are CALLED.
 *
 * `Object.keys(body)` alone is not enough and the Brazil probe paid for
 * learning that — it reported the CKAN envelope, which is identical for every
 * CKAN call ever made, as if it were a finding. So this unwraps the common
 * envelopes one level and reports the FIRST ROW's keys, which is the thing
 * that decides whether a title/deadline/amount can be mapped at all.
 */
export function describeJson(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return "声称是 JSON，但解析不了";
  }
  if (Array.isArray(body)) {
    return body.length === 0 ? "JSON 空数组" : `JSON 数组 ${body.length} 条 · 首条字段：${keysOf(body[0])}`;
  }
  if (body === null || typeof body !== "object") return `JSON 标量：${String(body).slice(0, 80)}`;
  const obj = body as Record<string, unknown>;

  // CKAN's envelope, checked before anything else: a CKAN call can FAIL at
  // HTTP 200 with `success: false`, and reading `result` without checking
  // `success` is how a client reports an error as an empty result set.
  if (typeof obj.success === "boolean") {
    if (!obj.success) return `CKAN 应答 success=false：${JSON.stringify(obj.error ?? {}).slice(0, 160)}`;
    const result = obj.result as Record<string, unknown> | undefined;
    if (result?.ckan_version) return `CKAN ${String(result.ckan_version)} —— ${String(result.site_title ?? "")}（ckan.ts 可以直接接）`;
    if (typeof result?.count === "number") {
      const first = Array.isArray(result.results) ? result.results[0] : undefined;
      return `CKAN 搜到 ${result.count} 个数据集${first ? ` · 首个：${String((first as Record<string, unknown>).title ?? "").slice(0, 60)}` : ""}`;
    }
    return `CKAN 应答 · result 字段：${keysOf(result)}`;
  }

  // Mercado Público's own envelope is believed to be `{ Cantidad, Listado }`.
  // Believed, not known — so both that shape and the generic ones are tried,
  // and an unrecognised body is reported as unrecognised rather than forced
  // into a shape it does not have.
  const listKey = ["Listado", "listado", "items", "results", "records", "releases", "data"].find(
    (key) => Array.isArray(obj[key]),
  );
  if (listKey) {
    const list = obj[listKey] as unknown[];
    const count = typeof obj.Cantidad === "number" ? obj.Cantidad : typeof obj.count === "number" ? obj.count : list.length;
    return list.length === 0
      ? `应答正常，但 ${listKey} 是空的（共 ${count}）—— 这是「这个窗口没有数据」，不是失败`
      : `${listKey} ${list.length} 条（共 ${count}）· 首条字段：${keysOf(list[0])}`;
  }
  return `JSON，外层字段：${keysOf(obj)}`;
}

function keysOf(value: unknown): string {
  if (value === null || typeof value !== "object") return "（不是对象）";
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 0 ? "（无字段）" : keys.slice(0, 14).join(" / ") + (keys.length > 14 ? ` …共 ${keys.length} 个` : "");
}

/**
 * Whether the source said it wants credentials.
 *
 * STATED PLAINLY: this is a heuristic and it has never matched a real Chilean
 * response, because no Chilean response has ever been received here. Its
 * first real run is its test. It is kept deliberately narrow — a Spanish word
 * for ticket/credential/authorisation, or a 401 — so that its failure mode is
 * "did not notice" rather than "announced a credential wall that is not
 * there". The verbatim body is printed either way, which is the part a reader
 * can actually trust.
 */
function looksLikeCredentialWall(status: number, body: string): boolean {
  if (status === 401) return true;
  return /\bticket\b|credencial|no autorizado|unauthorized|api[\s_-]?key|autenticaci[oó]n/i.test(body.slice(0, 2000));
}

export async function knockDoor(door: Door, ticket?: string): Promise<DoorResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = door.needsTicket && ticket ? appendTicket(door.url, ticket) : door.url;
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow", cache: "no-store" });
    const text = await response.text();
    const ms = Date.now() - started;
    const base = { ...door, ms, status: response.status, contentType: response.headers.get("content-type") };

    // FIRST, before the status code is read as anything. Our own gateway
    // answers 403 for a host that is not on its allowlist, which is the same
    // status a WAF uses and the opposite diagnosis. See egress-denial.ts.
    const denial = egressDenial(response.headers, text);
    // The body is kept even though nothing reached Chile. It is the ONLY
    // real payload a fully-denied round produces, and it is what pins the
    // finding that a 403 here is manufactured locally — without it, the
    // fixture directory after such a run holds nothing at all.
    if (denial) return { ...base, body: text, verdict: "egress_denied", detail: describeEgressDenial(denial) };

    if (!response.ok) {
      const snippet = bodySnippet(text);
      return {
        ...base,
        body: text,
        verdict: looksLikeCredentialWall(response.status, text) ? "credential_required" : "refused",
        detail: `${response.status} ${response.statusText}${snippet ? ` —— 原文：${snippet}` : "（空正文）"}`,
      };
    }

    // A 200 is not a pass. ANTT's appliance serves its rejection page with
    // one, and that mistake was made three times in one run before
    // block-page.ts existed.
    const blocked = blockPageReason(text);
    if (blocked !== null) return { ...base, body: text, verdict: "block_page", detail: `200 但是拦截页：「${blocked}」${pageTitle(text) ? ` · ${pageTitle(text)}` : ""}` };

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      // A 200 carrying an error envelope is how several Latin American APIs
      // report a missing key, so the credential check runs on successful
      // bodies too rather than only on failures.
      const detail = describeJson(trimmed);
      if (looksLikeCredentialWall(response.status, trimmed) && /error|mensaje|message/i.test(trimmed.slice(0, 500))) {
        return { ...base, body: text, verdict: "credential_required", detail: `200，但正文像是在要凭证：${bodySnippet(text)}` };
      }
      return { ...base, body: text, verdict: detail.includes("空") ? "answered_empty" : "answered", detail };
    }

    const visible = visibleText(text);
    const links = (text.match(/<a\b[^>]*href="/gi) ?? []).length;
    return {
      ...base,
      body: text,
      verdict: visible.length < 800 || links < 5 ? "answered_empty" : "answered",
      detail: `${Math.round(text.length / 1024)}KB · 正文 ${visible.length} 字 · ${links} 个链接${pageTitle(text) ? ` · ${pageTitle(text)}` : ""}`,
    };
  } catch (err) {
    // The whole cause chain. "fetch failed" cannot distinguish DNS from TLS
    // from a reset from a connect timeout, and those need four different
    // answers — the lesson lib/fetch-failure.ts exists for.
    return {
      ...door,
      ms: Date.now() - started,
      status: null,
      verdict: "unreachable",
      detail: describeFetchFailure(err).slice(0, 240),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Appends the owner's ticket without disturbing a query string the door already has. */
function appendTicket(url: string, ticket: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("ticket", ticket);
  return parsed.toString();
}

/**
 * The refusal in the operator's own words, tags stripped.
 *
 * Printed verbatim and at length because on a credential wall this sentence
 * IS the deliverable: it is what names the parameter, and often where to
 * request one. Paraphrasing it would throw away the only measured thing in a
 * failed round.
 */
function bodySnippet(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function knockAllChileDoors(ticket?: string, onDoor?: (result: DoorResult) => void): Promise<DoorResult[]> {
  const results: DoorResult[] = [];
  for (const door of ALL_CHILE_DOORS) {
    // A ticket-only door with no ticket is SKIPPED, not failed. Reporting it
    // as a refusal would put a red mark against Chile for a decision the
    // platform owner has not made yet.
    if (door.needsTicket && !ticket) {
      const skipped: DoorResult = {
        ...door,
        ms: 0,
        status: null,
        verdict: "credential_required",
        detail: "跳过：没有配置 CHILE_MERCADOPUBLICO_TICKET。这不是被拒，是我们没有凭证，也不该自己去弄一个。",
      };
      results.push(skipped);
      onDoor?.(skipped);
      continue;
    }
    const result = await knockDoor(door, ticket);
    results.push(result);
    onDoor?.(result);
  }
  return results;
}

const VERDICT_LABELS: Record<DoorVerdict, string> = {
  egress_denied: "本机出口被拦",
  unreachable: "连不上",
  refused: "对方拒绝",
  credential_required: "要凭证",
  block_page: "200 但是拦截页",
  answered_empty: "答了，但是空的",
  answered: "通了 ★",
};

/**
 * @param where names the machine that knocked. Not decoration: this probe's
 *   entire premise is that the answer depends on the egress, so a report that
 *   does not say which egress produced it is unusable the moment there are
 *   two of them — the same reason brazil-doors.ts takes this argument.
 */
export function renderChileReport(results: DoorResult[], where: string): string {
  const chile = results.filter((r) => r.confidence !== "control");
  // The two control groups are counted separately because they answer
  // different questions — see the CONTROLS comment. Collapsing them is what
  // produced a wrong summary on this probe's first run.
  const hasNetwork = results.some((r) => r.id === REACHABILITY_CONTROL && r.verdict === "answered");
  const peerControls = results.filter((r) => r.confidence === "control" && r.id !== REACHABILITY_CONTROL);
  const peersOpened = peerControls.filter((r) => r.verdict === "answered" || r.verdict === "answered_empty");
  const denied = results.filter((r) => r.verdict === "egress_denied");
  const opened = chile.filter((r) => r.verdict === "answered" || r.verdict === "answered_empty");

  const lines = [
    `智利入口摸底 —— 从【${where}】这一侧敲门`,
    "",
    "问的四件事：门在哪、要不要凭证、这台机器够不够得着、一条真实记录长什么样。",
    "列表里每一条 URL 都是假设，不是已知事实 —— 标「猜」的那些连拼法都可能是错的，",
    "它们回 404 说明的是拼法，不是智利。",
    "",
    "─".repeat(74),
    "",
    ...results.map((r) =>
      [
        `${r.id}  ${r.what}`,
        `    ${r.url}`,
        `    ${VERDICT_LABELS[r.verdict].padEnd(14)}${(r.status === null ? "" : String(r.status)).padStart(4)} ${String(r.ms).padStart(6)}ms  ${r.detail}`,
        "",
      ].join("\n"),
    ),
    "─".repeat(74),
    "",
  ];

  // The reading order matters and it is not the list order. If the PEER
  // controls are shut, nothing below them means anything — and this has to be
  // said before any Chilean row is read, not after.
  //
  // Note which control governs this. C0 answering proves the process has a
  // socket; it does NOT license reading the Chilean rows as data, because a
  // gateway that allowlists github.com and denies every government host will
  // pass C0 and refuse all thirteen. Only the peer controls speak to that.
  if (peersOpened.length === 0) {
    lines.push(
      `⚠ 这一轮不成立，不要往下读成「智利的情况」。`,
      "",
      `  对照 B（${peerControls.map((r) => r.id).join("、")}）一个都没通 —— 连生产环境天天在跑的巴西 PNCP 和秘鲁 OECE，`,
      "  从这台机器也够不着。同一台机器对智利说的话，因此一个字都不能采信。",
      hasNetwork
        ? `  （对照 A 是通的：进程有网。这恰恰说明问题不是「没网」，而是这台机器只允许去少数几个域名。）`
        : `  （对照 A 也没通：这台机器根本没有出网能力，先修这个。）`,
      "",
      denied.length > 0
        ? `  ${denied.length} 个门是被本容器的网络策略拦下的：网关自己回 403（x-deny-reason: host_not_allowed），\n  没有向对方建立任何连接。这是环境设置，不是数据源的状态 —— 在环境的 Network access\n  里放行这些域名，或者换一台有出口的机器（比如跑夜间导入的那台）重跑。`
        : "  失败形态不是出口拦截，要逐条读上面的 detail。",
      "",
      `  在那之前不要写连接器：字段名、字段含义、每天多少条 —— 一个都没测到，写出来全是猜的。`,
    );
    return lines.join("\n");
  }

  lines.push(
    `对照 B：${peersOpened.length} / ${peerControls.length} 通 —— 同类政府开放数据主机这台机器够得着，下面的结果可以当数据读。`,
    "",
    opened.length > 0
      ? `智利这边通了 ${opened.length} 个：${opened.map((r) => r.id).join("、")}。\n先看这些门的「首条字段」那一行 —— 映射器是从字段名写出来的，不是从状态码。`
      : "智利这边一个都没通，而同类主机是通的 —— 这一次差别才真的出在智利那边。\n下一步是把上面每一条的 detail 读完：要凭证、拼法错、主机拒绝，三种要走三条不同的路。",
  );

  const walls = chile.filter((r) => r.verdict === "credential_required");
  if (walls.length > 0) {
    lines.push(
      "",
      `有 ${walls.length} 个门要凭证（${walls.map((r) => r.id).join("、")}）。`,
      "按仓库的规矩，探针到此为止：不绕、不伪装浏览器、不自己去注册。",
      "申请与否是平台所有者的决定 —— 上面那几行的原文写了对方要什么。",
    );
  }
  return lines.join("\n");
}
