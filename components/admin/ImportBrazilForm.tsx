"use client";

import { useState } from "react";

/**
 * The 巴西 tab of 新项目清单, over PNCP's live search index.
 *
 * Structurally the Peru form's sibling — a live fetch, no file upload — but
 * its result panel is bigger on purpose. Brazil is the source where a run can
 * succeed and still be wrong in two ways that a total cannot show:
 *
 *  - a modality can stop on the row cap instead of on the date window, which
 *    means the period was only partly swept and "1300 条" is a floor, not a
 *    count;
 *  - `/itens` can cap a tender's line items, which UNDERSTATES its amount
 *    rather than failing — the Elói Mendes tender read R$372,530 against a
 *    portal reading R$2,812,092 until paging was fixed (2026-09-18).
 *
 * Both have their own line below, because an understated amount falls under
 * the US$2,000,000 floor and an excluded row is never written at all.
 */
type BrazilResult = {
  fetchedRows: number;
  mappedCount: number;
  keptCount: number;
  excludedCount: number;
  withoutAmount: number;
  sealedBudget: number;
  excludedByReason: { reason: string; count: number }[];
  maxItemsSeen: number;
  tendersAtMaxItems: number;
  keptByTier: { tier: string; count: number }[];
  keptByValueBand: { band: string; count: number }[];
  excludedCsvPath?: string;
  byModality: { modalidade: number; rows: number; pages: number; stoppedBy: "window" | "cap" | "end" | "error" }[];
  written?: number;
  failed?: number;
  /** Mirrors BrazilIngestResult.documentLinks — see that field for why both counts are reported. */
  documentLinks?: {
    tendersAsked: number;
    tendersWithLinks: number;
    linkCount: number;
    failed: number;
    stoppedEarly: boolean;
    failureReasons: string[];
  };
  write: boolean;
};

const STOPPED_BY_LABELS: Record<BrazilResult["byModality"][number]["stoppedBy"], { text: string; warn: boolean }> = {
  window: { text: "已覆盖整个时间窗", warn: false },
  end: { text: "索引翻到底了", warn: false },
  cap: { text: "被条数上限截断——窗口没取完，数量只是下限", warn: true },
  error: { text: "中途出错，这个采购方式只取到一部分", warn: true },
};

/** Measured 2026-09-18: a 3-day window returned 795 rows needing an amount lookup, at ~0.5s apiece. */
const ROWS_PER_DAY = 265;
const SECONDS_PER_AMOUNT = 0.5;
const SERVERLESS_CEILING_SECONDS = 300;
/**
 * The attachment pass, which this estimate used to ignore entirely.
 *
 * On 2026-09-19 a run with the checkbox ticked sat past thirty minutes
 * against a box that said 136 秒 — because 136 秒 was the amount pass alone
 * and the estimate did not change when the checkbox did. It is a second
 * serial loop, one request per KEPT tender, through the same 0.5s pacing
 * slot plus a round trip.
 *
 * Both numbers below are honest about what they are. The kept share is a
 * rough upper bound rather than a measurement — the exclusion rules decide
 * it and it moves with the day's mix — so the estimate is presented as
 * "at least", never as a figure to plan around.
 */
const KEPT_SHARE_CEILING = 0.5;
const SECONDS_PER_DOCUMENT_LOOKUP = 1.5;

type Estimate = { total: number; amounts: number; documents: number };

function estimateSeconds(days: number, skipAmounts: boolean, withDocuments: boolean): Estimate {
  const rows = days * ROWS_PER_DAY;
  const pagingSeconds = Math.ceil(rows / 100) * 1.2;
  const amounts = Math.round(pagingSeconds + (skipAmounts ? 0 : rows * SECONDS_PER_AMOUNT));
  const documents = withDocuments ? Math.round(rows * KEPT_SHARE_CEILING * SECONDS_PER_DOCUMENT_LOOKUP) : 0;
  return { total: amounts + documents, amounts, documents };
}

function ResultPanel({ result }: { result: BrazilResult }) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
      <p className="text-sm font-bold text-[#071826]">
        抓取 {result.fetchedRows} 条 → 映射 {result.mappedCount} 条 →{" "}
        <span className="text-[#b86e00]">进入推荐 {result.keptCount} 条</span>，被规则排除 {result.excludedCount} 条
      </p>

      {result.keptByTier.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#52636e]">
          {result.keptByTier.map((row) => (
            <span key={row.tier}>
              {row.tier} <strong className="text-[#071826]">{row.count}</strong>
            </span>
          ))}
        </div>
      )}

      {result.keptByValueBand.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[#52636e]">
          {result.keptByValueBand.map((row) => (
            <li key={row.band}>
              └ {row.band} <strong className="text-[#071826]">{row.count}</strong>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-0.5 border-t border-[#eef1f2] pt-3 text-xs text-[#52636e]">
        {result.byModality.map((row) => {
          const stopped = STOPPED_BY_LABELS[row.stoppedBy];
          return (
            <li key={row.modalidade} className={stopped.warn ? "font-bold text-[#8a2b2b]" : ""}>
              采购方式 {row.modalidade}：{row.rows} 条，翻了 {row.pages} 页 —— {stopped.warn ? "⚠ " : ""}
              {stopped.text}
            </li>
          );
        })}
      </ul>

      {/*
        The one failure shape that cannot announce itself. A round maximum
        with many tenders tied at it is a cap; a varied maximum with one
        tender at it is a real distribution.
      */}
      <p className={`mt-2 text-xs ${result.tendersAtMaxItems > 5 ? "font-bold text-[#8a2b2b]" : "text-[#64717c]"}`}>
        单个项目最多 {result.maxItemsSeen} 个标的（有 {result.tendersAtMaxItems} 条正好是这个数）
        {result.tendersAtMaxItems > 5 ? " —— ⚠ 很多条并列在同一个数，像是明细被分页截断了，金额会偏低" : " —— 没有分页截断的迹象"}
      </p>

      {result.withoutAmount > 0 && (
        <p className="mt-1 text-xs text-[#64717c]">
          没有金额：{result.withoutAmount} 条{result.sealedBudget > 0 ? `（其中 ${result.sealedBudget} 条是法定预算保密，不是取不到）` : ""}
        </p>
      )}

      {result.excludedByReason.length > 0 && (
        <div className="mt-3 border-t border-[#eef1f2] pt-3">
          <p className="text-xs font-black text-[#52636e]">排除原因（多到少）</p>
          <ul className="mt-1 space-y-0.5 text-xs text-[#64717c]">
            {result.excludedByReason.map((row) => (
              <li key={row.reason}>
                <strong className="text-[#071826]">{row.count}</strong> 条 · {row.reason.slice(0, 60)}
                {row.reason.length > 60 ? "…" : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded-lg border border-[#f0d9a8] bg-[#fff8e9] px-2.5 py-1.5 text-[11px] leading-5 text-[#7a5200]">
            写库前扫一眼「关键词」那几类——葡语规则还没被多少真实语料检验过，<strong>被排除的项目不会写进数据库，误杀是永久且无声的</strong>。
          </p>
        </div>
      )}

      {result.excludedCsvPath ? (
        <p className="mt-2 font-mono text-[11px] text-[#52636e]">被排除的完整清单：{result.excludedCsvPath}</p>
      ) : result.write ? null : (
        <p className="mt-2 text-[11px] text-[#64717c]">（没有生成 CSV——线上部署的文件系统是只读的，想要完整清单请在本地跑命令行。）</p>
      )}

      {result.write ? (
        <p className="mt-2 text-xs text-[#233846]">
          已写入 Supabase {result.written ?? 0} 条{result.failed ? `，失败 ${result.failed} 条` : ""}。
        </p>
      ) : null}

      {/*
        Both numbers, always. This is the first real measurement of PNCP's
        /arquivos response — it was parsed from the published API, never from
        a live answer — so "asked 120, found 0 links" is the reading being
        wrong, and printing only the link count would make that look like
        "these tenders publish no documents".
      */}
      {result.documentLinks ? (
        <p className="mt-2 text-xs text-[#233846]">
          标书链接：查了 {result.documentLinks.tendersAsked} 条项目，
          {result.documentLinks.tendersWithLinks} 条有附件，共记录 {result.documentLinks.linkCount} 个下载链接
          {result.documentLinks.failed ? `，${result.documentLinks.failed} 条没问到` : ""}。
          {result.documentLinks.stoppedEarly
            ? "（连续失败太多，这一步提前停了——项目本身已经写入，只是没拿到附件链接。）"
            : result.documentLinks.tendersAsked > 0 && result.documentLinks.linkCount === 0
              ? "（一个都没有——这很可能是 PNCP 的返回格式和预期不符，不是这些项目真的没有标书，请告诉我。）"
              : ""}
        </p>
      ) : null}
      {/*
        The refusals, verbatim. A zero with no reason next to it is what sent
        a real run into a silent half hour on 2026-09-19: "asked 265, got 0"
        reads as a fact about Brazil's tenders when it is a fact about our
        request.
      */}
      {result.documentLinks && result.documentLinks.failureReasons.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-[#7a5200]">
          {result.documentLinks.failureReasons.map((reason) => (
            <li key={reason} className="font-mono break-all">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {!result.write ? (
        <p className="mt-2 text-xs text-[#64717c]">预览模式，一条都没有写入 Supabase。</p>
      ) : null}
    </div>
  );
}

export function ImportBrazilForm() {
  // 1, not 3. See the estimate below: 3 days does not fit in the serverless
  // time limit, and a button that dies two thirds through writes nothing.
  const [days, setDays] = useState("1");
  const [write, setWrite] = useState(false);
  const [skipAmounts, setSkipAmounts] = useState(false);
  // Defaults ON, unlike the two above: an imported tender with no document
  // links reaches 待补文件 with nothing to click, which is the whole problem
  // this pass exists to fix. Only does anything on a write run.
  const [downloadDocuments, setDownloadDocuments] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BrazilResult | null>(null);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const dayCount = Number(days) || 1;
  const estimated = estimateSeconds(dayCount, skipAmounts, write && downloadDocuments);
  const tooLong = estimated.total > SERVERLESS_CEILING_SECONDS;

  const cliCommand = `npm run ingest:brazil-live -- --days ${dayCount}${skipAmounts ? " --skip-amounts" : ""}${write && downloadDocuments ? " --documents" : ""}${write ? " --write" : ""}`;

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // The command is on screen and selectable either way.
    }
  }

  async function run() {
    if (write && !confirm(`确定要把最近 ${dayCount} 天的巴西 PNCP 标书写入 Supabase 吗？`)) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-brazil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: dayCount, write, skipAmounts, downloadDocuments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error ?? `HTTP ${res.status}`, cliCommand: data.cliCommand });
        return;
      }
      setResult(data as BrazilResult);
    } catch (err) {
      // A run that outlives the platform's time limit lands here as a
      // network error, with nothing written — which is why the command is
      // offered rather than just the message.
      setError({ message: err instanceof Error ? err.message : String(err), cliCommand });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Brasil · 主渠道</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">PNCP — 全国公共采购门户</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        巴西 Lei 14.133/2021 要求直接行政部门（联邦、州、市）把招标公告发到 PNCP，所以这是覆盖面最广的一个口子。
        当前只扫<strong>公开招标（Concorrência，电子 + 现场）</strong>两种采购方式；国有企业（Petrobras、各州电力公司，走 Lei 13.303/2016）
        和特许经营（PPI、ANEEL 输电拍卖）<strong>不在 PNCP 上</strong>，是另外的渠道。
      </p>
      <p className="mt-2 text-sm text-[#52636e]">
        每条项目都有直达标书页的链接（<code className="font-mono text-xs">pncp.gov.br/app/editais/…</code>），附件可以远程直接下载，不用一个个手点。
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">只保留最近几天发布的</span>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="h-9 w-24 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
        <label className={`flex items-center gap-2 pb-2 pl-5 text-xs ${write ? "text-[#233846]" : "text-[#9aa7b0]"}`}>
          <input
            type="checkbox"
            checked={downloadDocuments}
            disabled={!write}
            onChange={(e) => setDownloadDocuments(e.target.checked)}
            className="size-4 accent-[#ffb21c]"
          />
          同时记录新写入项目的标书下载链接（之后在「待补文件」页可一键打包下载）
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-[#233846]">
          <input type="checkbox" checked={skipAmounts} onChange={(e) => setSkipAmounts(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          跳过取金额（快很多，但<strong>所有项目都会变成「无金额」</strong>，不能据此判断分级）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mb-0.5 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running ? "运行中…（可能要几分钟）" : write ? "拉取并写入" : "预览"}
        </button>
      </div>

      {/*
        An estimate, not a promise — but it is built from a real measurement
        (2026-09-18: 3 天 = 795 条) rather than a guess, and it is the
        difference between a button that works and one that silently dies.
      */}
      <p className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${tooLong ? "border-[#f0d9a8] bg-[#fff8e9] text-[#7a5200]" : "border-[#d8e0e3] bg-[#f7f9f9] text-[#52636e]"}`}>
        {dayCount} 天大约 {dayCount * ROWS_PER_DAY} 条，预计耗时 <strong>{estimated.total} 秒</strong>
        （按 2026-09-18 实测：3 天 795 条；取金额受 PNCP 限流约束，快不了）。
        {estimated.documents > 0 && (
          <>
            {" "}
            其中<strong>取标书链接约 {estimated.documents} 秒</strong>，而且这是<strong>下限</strong>——
            这一步是逐条串行请求，PNCP 的接口形状还没实测过。连续 10 条失败就会自动停下并告诉你原因，
            那时项目本身已经写进库了，只是没拿到附件链接。
          </>
        )}
        {tooLong ? (
          <>
            {" "}
            <strong>超过线上部署 {SERVERLESS_CEILING_SECONDS} 秒的执行上限，网页按钮会中途断掉且什么都不写</strong>
            ——请改成在自己电脑上跑下面这条命令，或者把天数降到 1。本地 <code className="font-mono">npm run dev</code> 打开这个页面时没有这个限制。
          </>
        ) : (
          " 在线上部署的 300 秒上限内。"
        )}
      </p>

      <div className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-3 py-2.5">
        <p className="text-[11px] font-black text-[#52636e]">在自己的电脑上跑（参数跟上面的设置同步，会把被排除的完整清单写到 exports/）</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#071826]">{cliCommand}</code>
          <button
            type="button"
            onClick={() => copyCommand(cliCommand)}
            className="h-7 shrink-0 rounded-lg border border-[#cbd6da] bg-white px-2.5 text-[11px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
          >
            {copied === cliCommand ? "已复制" : "复制"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p>{error.message}</p>
          {error.cliCommand && (
            <div className="mt-2 border-t border-red-200 pt-2">
              <p className="font-black text-[#8a2b2b]">改在自己的电脑上跑，参数已按上面的设置填好：</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#071826]">{error.cliCommand}</code>
                <button
                  type="button"
                  onClick={() => copyCommand(error.cliCommand!)}
                  className="h-7 shrink-0 rounded-lg border border-red-300 bg-white px-2.5 text-[11px] font-black text-[#8a2b2b] transition-colors hover:bg-red-100"
                >
                  {copied === error.cliCommand ? "已复制" : "复制"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </div>
  );
}
