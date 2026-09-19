import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";
import { ckanAction, ckanPackageSearch, ckanPackageShow, type CkanPackage, type CkanPackageSearch, type CkanResource } from "@/lib/ingestion/connectors/ckan";
import { collectLinks, isInteresting, type PageLink } from "@/lib/ingestion/brazil-behind-doors";

/**
 * The two routes that survived the reachability scoring, followed to the data.
 *
 * `brazil-behind-doors.ts` established which links land on hosts this runner
 * can open. Two came through clean, and both are candidates to replace work
 * that is currently blocked:
 *
 *   ANTT · Projetos de Concessão de Rodovias / de Ferrovias
 *     The road and rail concession pipeline, as open data, on a host that
 *     answers. PPI — the portal this repo went looking for that pipeline on —
 *     refuses every route from every machine (ECONNRESET on the project list
 *     and the WordPress API, "Acesso Negado" on its PDFs).
 *
 *   ANTAQ · Audiências Públicas em andamento
 *     Live public consultations, which is where a draft edital appears BEFORE
 *     the auction. The auction pages themselves are all on leilao.antaq.gov.br
 *     behind Cloudflare; door B7 pulled a real 659KB draft edital out of this
 *     section instead.
 *
 * A dataset existing is not a dataset being usable. What decides that is the
 * column contract and whether the rows are current, so this prints both, plus
 * every resource's format, URL and whether CKAN will serve its rows directly.
 * Nothing here is mapped — a mapper gets written from what this prints, which
 * is the same order of work lib/ingestion/README.md records for every other
 * source in this repo.
 *
 * Read-only. No Supabase, no writes, no model calls.
 */

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 25_000;
const ANTT_CKAN = "https://dados.antt.gov.br";

/** Enough of a file to see its header row and first records, and no more. */
const SAMPLE_BYTES = 8_192;
/** A whole file this big is not worth pulling to look at its first line. */
const MAX_WHOLE_FILE = 4_000_000;

function line(...parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
}

function truncate(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * The first bytes of a resource, asked for as a range so a 200MB CSV does not
 * have to cross the wire to show its header row. A server that ignores the
 * range answers 200 with the whole file; the content-length check is what
 * stops that from being downloaded anyway.
 */
async function sampleResource(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { ...HEADERS, Range: `bytes=0-${SAMPLE_BYTES - 1}` }, signal: controller.signal, redirect: "follow" });
    if (!response.ok && response.status !== 206) return `取不到 —— ${response.status}`;
    const length = Number(response.headers.get("content-length") ?? "0");
    if (response.status === 200 && length > MAX_WHOLE_FILE) {
      return `服务器不认 Range，整份 ${Math.round(length / 1024 / 1024)}MB —— 没下，留给连接器去流式读`;
    }
    const text = (await response.text()).slice(0, SAMPLE_BYTES);
    const blocked = blockPageReason(text);
    if (blocked !== null) return `拦截页「${blocked}」`;
    const trimmed = text.trim();
    if (trimmed.startsWith("%PDF-")) return "PDF";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      // The sample is a cut-off JSON document, so it cannot be parsed. The
      // keys are still readable, and the keys are the column contract.
      const keys = [...new Set([...trimmed.matchAll(/"([A-Za-z0-9_ ãáâéêíóôõúçÃÁÂÉÊÍÓÔÕÚÇ-]{2,40})"\s*:/g)].map((m) => m[1]))];
      return `JSON${response.status === 206 ? "（只取了头 8KB）" : ""} —— 键：${keys.slice(0, 18).join(" / ") || "（没认出来）"}`;
    }
    if (trimmed.startsWith("<")) return `HTML —— ${pageTitle(text) || truncate(visibleText(text), 80)}`;
    const rows = trimmed.split(/\r?\n/).filter((r) => r.trim() !== "");
    return [
      `文本${response.status === 206 ? "（只取了头 8KB）" : ""}`,
      `表头：${truncate(rows[0], 200)}`,
      rows[1] ? `首行：${truncate(rows[1], 200)}` : null,
    ]
      .filter((p) => p !== null)
      .join("\n            ");
  } catch (err) {
    return `取不到 —— ${describeFetchFailure(err).slice(0, 120)}`;
  } finally {
    clearTimeout(timer);
  }
}

/** The column contract plus a couple of rows, which is what a mapper is written from. */
async function readDatastore(base: string, resourceId: string): Promise<string[]> {
  try {
    const result = await ckanAction<{ total?: number; fields?: { id?: string; type?: string }[]; records?: Record<string, unknown>[] }>(
      base,
      "datastore_search",
      { resource_id: resourceId, limit: 3 },
      { timeoutMs: TIMEOUT_MS },
    );
    const fields = (result.fields ?? []).filter((f) => f.id !== "_id");
    const out = [`可直接查表 —— 共 ${result.total ?? 0} 行`, `列：${fields.map((f) => `${f.id}(${f.type})`).join(" / ")}`];
    for (const record of (result.records ?? []).slice(0, 2)) {
      const cells = fields
        .map((f) => (f.id === undefined ? "" : `${f.id}=${truncate(record[f.id], 42)}`))
        .filter((c) => c !== "" && !c.endsWith("="));
      out.push(`行：${cells.slice(0, 8).join("  ")}`);
    }
    return out;
  } catch (err) {
    return [`表查不了 —— ${describeFetchFailure(err).slice(0, 120)}`];
  }
}

const ANTT_ATTEMPTS = 6;
const ANTT_GAP_MS = 3_000;

/**
 * How often ANTT actually answers, rather than whether it answered once.
 *
 * Measured across three runs minutes apart from three runners: rejected,
 * then four calls in a row accepted, then rejected again — the same URL each
 * time, and `status_show` passing in the run where `package_search` did not.
 * The F5 appliance in front of it is refusing some requests and not others.
 *
 * One sample of that is not a finding, it is a coin toss written down. A
 * connector's retry policy is decided by the rate, so this reports the rate:
 * N attempts, spaced, with the successes and the failures counted. It also
 * means a run no longer reports "ANTT unreachable" because the first call
 * lost the toss.
 */
async function searchAnttWithRetries(): Promise<{ found: CkanPackageSearch | null; report: string[] }> {
  const verdicts: string[] = [];
  let found: CkanPackageSearch | null = null;
  for (let attempt = 1; attempt <= ANTT_ATTEMPTS; attempt += 1) {
    try {
      const result = await ckanPackageSearch(ANTT_CKAN, { q: "Projetos de Concessão", rows: 10 }, { timeoutMs: TIMEOUT_MS });
      verdicts.push(`${attempt}:通`);
      if (found === null) found = result;
    } catch (err) {
      const message = describeFetchFailure(err);
      verdicts.push(`${attempt}:${/Request Rejected/i.test(message) ? "F5拒" : "错"}`);
    }
    if (attempt < ANTT_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, ANTT_GAP_MS));
  }
  const passes = verdicts.filter((v) => v.endsWith("通")).length;
  return {
    found,
    report: [
      `  package_search 连打 ${ANTT_ATTEMPTS} 次（间隔 ${ANTT_GAP_MS / 1000}s）：${passes} 次通 / ${ANTT_ATTEMPTS - passes} 次被拒`,
      `    ${verdicts.join("  ")}`,
      passes === 0
        ? "    一次都没通 —— 这次当它是关的。"
        : passes === ANTT_ATTEMPTS
          ? "    次次都通 —— 之前那次被拒是偶发，连接器照常建，带重试就行。"
          : "    时通时不通 —— 能建，但连接器必须带重试，且单次失败不能当作「没有数据」。",
    ],
  };
}

async function digPackage(base: string, pkg: CkanPackage): Promise<string[]> {
  let full: CkanPackage = pkg;
  try {
    if (pkg.name !== undefined) full = await ckanPackageShow(base, pkg.name, { timeoutMs: TIMEOUT_MS });
  } catch {
    // package_search already gave us the resources; a failed package_show is
    // not worth aborting the dig for.
  }
  const resources: CkanResource[] = Array.isArray(full.resources) ? full.resources : [];
  const out = [
    `  ${full.title ?? full.name ?? "?"}`,
    `    ${line(full.name, full.metadata_modified ? `最后更新 ${full.metadata_modified.slice(0, 10)}` : null, full.organization?.title)}`,
  ];
  if (full.notes) out.push(`    说明：${truncate(full.notes, 260)}`);

  for (const resource of resources) {
    out.push(
      "",
      `    ▸ ${line(resource.name ?? "（无名）", resource.format?.toUpperCase(), resource.last_modified ? `更新于 ${resource.last_modified.slice(0, 10)}` : null, resource.size ? `${Math.round(resource.size / 1024)}KB` : null)}`,
    );
    if (resource.url) out.push(`      ${resource.url.slice(0, 118)}`);
    if (resource.datastore_active === true && resource.id !== undefined) {
      for (const l of await readDatastore(base, resource.id)) out.push(`      ${l}`);
      continue;
    }
    if (resource.url && /^(CSV|JSON|XML|TXT)$/i.test(resource.format ?? "")) {
      out.push(`      直接取：${await sampleResource(resource.url)}`);
    }
  }
  return out;
}

async function readPage(url: string): Promise<{ ok: boolean; note: string; links: PageLink[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    const html = await response.text();
    if (!response.ok) return { ok: false, note: `拒绝 ${response.status}`, links: [] };
    const blocked = blockPageReason(html);
    if (blocked !== null) return { ok: false, note: `200 但是拦截页「${blocked}」`, links: [] };
    return { ok: true, note: `${Math.round(html.length / 1024)}KB · 正文 ${visibleText(html).length} 字`, links: collectLinks(html, url) };
  } catch (err) {
    return { ok: false, note: `连不上 ← ${describeFetchFailure(err).slice(0, 140)}`, links: [] };
  } finally {
    clearTimeout(timer);
  }
}

const ANTAQ_CONSULTATIONS = "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas";

/**
 * The live consultations, reached by following the link rather than guessing
 * its slug. The report truncated that URL at `…/audiencias-pu`, and a guessed
 * slug that 404s would read as "there are no live consultations" — the same
 * failure the Plone extension bug would have caused one level up.
 */
async function digAntaqConsultations(): Promise<string[]> {
  const index = await readPage(ANTAQ_CONSULTATIONS);
  if (!index.ok) return [`  索引页读不到 —— ${index.note}`];
  const live = index.links.find((l) => /em\s+andamento/i.test(l.text));
  if (live === undefined) {
    return [`  索引页读到了（${index.note}），但没有「em andamento」那条链接。当前它的链接文字是：`, ...index.links.filter(isInteresting).slice(0, 10).map((l) => `      · ${l.text || "（无文字）"}`)];
  }
  const page = await readPage(live.href);
  if (!page.ok) return [`  「${live.text}」→ ${live.href}`, `  ${page.note}`];

  const candidates = page.links.filter((l) => isInteresting(l) && !/compartilhe|termo de uso|aviso de privacidade/i.test(l.text));
  const reachable = candidates.filter((l) => l.reach !== "closed");
  const out = [
    `  「${live.text}」`,
    `  ${live.href}`,
    `  ${page.note} · ${candidates.length} 条值得跟，其中 ${reachable.length} 条够得着`,
    "",
    ...reachable.slice(0, 16).flatMap((l) => [`    · ${truncate(l.text, 84) || "（无文字）"}${l.ext === "（页面）" ? "" : `  [${l.ext}]`}`, `      ${l.href.slice(0, 116)}`]),
    ...(candidates.length > reachable.length
      ? ["", `    取不到的 ${candidates.length - reachable.length} 条：`, ...candidates.filter((l) => l.reach === "closed").slice(0, 5).map((l) => `      · ${truncate(l.text, 60)} → ${l.host}`)]
      : []),
  ];

  // The index listing consultations is not the same as the documents being
  // fetchable, and B7 only proved it for one of them. These open the
  // consultations themselves and count what is actually attached.
  const hearings = reachable.filter((l) => /audi[êe]ncia\s+p[úu]blica\s+n/i.test(l.text));
  const govBr = hearings.filter((l) => l.host === "www.gov.br").slice(0, 3);
  // One from ANTAQ's own hearing system too: it appeared in the listing and
  // has never been knocked, so its verdict is unknown rather than closed.
  const sisap = hearings.find((l) => l.host === "sisapinternet.antaq.gov.br");
  const toOpen = [...govBr, ...(sisap ? [sisap] : [])];

  out.push("", `  ── 打开其中 ${toOpen.length} 场，看附件到底取不取得到 ──`);
  for (const hearing of toOpen) {
    out.push("", `  ▸ ${truncate(hearing.text, 90)}`, `    ${hearing.host}`);
    const detail = await readPage(hearing.href);
    if (!detail.ok) {
      out.push(`    ${detail.note}`);
      continue;
    }
    const files = detail.links.filter((l) => /^(pdf|docx?|xlsx?|zip|rar|7z)$/i.test(l.ext));
    const gettable = files.filter((l) => l.reach !== "closed");
    out.push(`    ${detail.note} · 附件 ${files.length} 个，够得着 ${gettable.length} 个`);
    for (const file of gettable.slice(0, 6)) {
      out.push(`      · ${truncate(file.text, 74) || "（无文字）"}  [${file.ext}]`);
    }
    if (files.length === 0) {
      out.push(`      没有直接挂附件 —— 页面上值得跟的链接：${detail.links.filter(isInteresting).slice(0, 4).map((l) => truncate(l.text, 40)).join(" / ") || "（无）"}`);
    }
  }
  return out;
}

export async function digPipeline(where: string): Promise<string> {
  const out: string[] = [
    `活着的那两条路，跟到数据为止 —— 从【${where}】这一侧`,
    "",
    "上一轮的结论：两个机构的拍卖页都是空壳（ANTAQ 89 条里 80 条锁在 Cloudflare 后面，",
    "ANEEL 三个分类、三个 Excel 全在打不开的主机上）。活下来的是两条：ANTT 的特许项目",
    "开放数据，和 gov.br 上的公开征询。这一轮问的是：那里面的数据能不能用。",
    "",
    "────────────────────────────────────────────────────────────────────────",
    "",
    "一、ANTT —— 公路与铁路的特许项目库（PPI 三条路全死，这是替代品）",
    "",
  ];

  const antt = await searchAnttWithRetries();
  out.push(...antt.report, "");
  if (antt.found !== null) {
    const wanted = antt.found.results.filter((p) => /projetos?\s+de\s+concess/i.test(p.title ?? p.name ?? ""));
    const packages = wanted.length > 0 ? wanted : antt.found.results.slice(0, 2);
    out.push(`  命中 ${antt.found.count} 个，其中标题对得上的 ${wanted.length} 个`, "");
    for (const pkg of packages.slice(0, 3)) {
      out.push(...(await digPackage(ANTT_CKAN, pkg)), "");
    }
  }

  out.push("────────────────────────────────────────────────────────────────────────", "", "二、ANTAQ —— 正在征询的项目（标书草案比拍卖公告早一步）", "");
  out.push(...(await digAntaqConsultations()));
  out.push(
    "",
    "────────────────────────────────────────────────────────────────────────",
    "",
    "判断标准，写在这里免得读的时候忘：有列名、有近期的更新时间、URL 能直接取，",
    "才算「能建连接器」。只有目录页和标题，不算。",
  );
  return out.join("\n");
}
