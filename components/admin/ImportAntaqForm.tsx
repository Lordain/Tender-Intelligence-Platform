"use client";

import { useState } from "react";
import type { AntaqIngestResult } from "@/lib/ingestion/ingest-antaq";

/**
 * The ANTAQ panel on 新项目清单 → 巴西.
 *
 * ── Why this panel spends more space on what it CANNOT get ────────────────
 *
 * Because a port concession hearing arrives with no money and no bid
 * deadline, and both absences are lawful and permanent rather than a failed
 * lookup. On every other source in this admin, 无金额 means "we did not manage
 * to read it" and the fix is to re-run. Here it means "the page does not state
 * one", the figure lives inside the EVTEA PDF, and re-running a hundred times
 * changes nothing. A panel that showed 「没有金额：5 条」 the way the PNCP panel
 * does would send someone hunting a bug that is not there — which is exactly
 * what happened with PNCP's own amountLookupFailed number on 2026-09-20.
 *
 * The third row of that table is the one people will ask about: the draft
 * edital and the EVTEA have URLs, and this import still does not save them as
 * documents, because those URLs are landing PAGES. Putting one behind a
 * subscriber's download button hands them an HTML page. So they are shown as
 * links to follow, labelled as pages.
 */

const SOURCE_URL =
  "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas/audiencias-publicas-em-andamento";

type AntaqError = { message: string; cliCommand?: string; unreachable?: boolean };

function WindowNote({ row }: { row: AntaqIngestResult["rows"][number] }) {
  return (
    <>
      {row.pageStampWarning && (
        <p className="mt-0.5 text-[11px] leading-5 text-[#7a5200]">⚠ {row.pageStampWarning}</p>
      )}
      {!row.inWindow && <p className="mt-0.5 text-[11px] leading-5 text-[#64717c]">{row.why}</p>}
    </>
  );
}

function ResultPanel({ result }: { result: AntaqIngestResult }) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
      <p className="text-sm font-bold text-[#071826]">
        ANTAQ 列出 {result.listedCount} 场 → 读到 {result.readCount} 场 →{" "}
        <span className="text-[#b86e00]">进入推荐 {result.keptCount} 条</span>
        {result.droppedByWindow > 0 ? `，窗口外 ${result.droppedByWindow} 条` : ""}
      </p>

      {/*
        Per host, every run. Keeping the six quietly would make a two-thirds
        gap look like the whole source — the reason the connector reports this
        at all rather than just returning what it managed to read.
      */}
      {result.skippedByHost.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[#64717c]">
          {result.skippedByHost.map((row) => (
            <li key={row.host}>
              <strong className="text-[#071826]">{row.count}</strong> 场没去取 · {row.host} —— {row.why}
            </li>
          ))}
        </ul>
      )}

      {result.failed.length > 0 && (
        <div className="mt-2 rounded-lg border border-[#f0d9a8] bg-[#fff8e9] px-2.5 py-1.5 text-[11px] leading-5 text-[#7a5200]">
          <p>⚠ {result.failed.length} 场取到了页面但没读成 —— 这是页面结构变了，不是来源变空了，请告诉我。</p>
          {result.failed.map((f) => (
            <p key={f.title} className="mt-0.5 font-mono text-[10px]">
              {f.title.slice(0, 70)} —— {f.why}
            </p>
          ))}
        </div>
      )}

      {result.unmappable.length > 0 && (
        <div className="mt-2 text-[11px] leading-5 text-[#64717c]">
          {result.unmappable.length} 场读到了但映射不出项目：
          {result.unmappable.map((line) => (
            <p key={line} className="font-mono text-[10px]">
              {line}
            </p>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2.5 border-t border-[#eef1f2] pt-3">
        {result.rows.map((row) => (
          <li key={row.slug} className={row.inWindow ? "" : "opacity-55"}>
            <p className="text-xs">
              <span className="font-mono font-black text-[#071826]">{row.tenderNumber}</span>{" "}
              <span className="rounded bg-[#fff8e9] px-1.5 py-0.5 text-[10px] font-black text-[#b86e00]">{row.tier}</span>{" "}
              <span className="text-[#233846]">{row.title}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#64717c]">
              日程到 {row.lastStatedDay ?? "页面没排日程"}
              {row.contributionsDeadline ? ` · 征询截止 ${row.contributionsDeadline}` : ""} · 公告附件{" "}
              {row.noticeCount} 个
            </p>
            <WindowNote row={row} />
            {row.inWindow && (
              <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#0a5c8a] underline">
                  听证页 ↗
                </a>
                {/*
                  Labelled 页 and not 下载 on purpose: these are landing pages
                  holding the draft edital and the EVTEA, and the import
                  deliberately does not store them as document links.
                */}
                {row.documentSections.map((section) => (
                  <a
                    key={section.url}
                    href={section.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0a5c8a] underline"
                  >
                    {section.title}（页）↗
                  </a>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>

      {result.write ? (
        <p className="mt-3 border-t border-[#eef1f2] pt-3 text-xs text-[#233846]">
          已写入 Supabase {result.written ?? 0} 条{result.writeFailed ? `，失败 ${result.writeFailed} 条` : ""}
          {result.skippedExcluded ? `，跳过 excluded ${result.skippedExcluded} 条` : ""}。
          {result.documentLinks
            ? ` 公告附件：记录 ${result.documentLinks.linkCount} 个下载链接，挂在 ${result.documentLinks.tendersWithLinks} 个项目上。`
            : " （勾上「记录公告附件」可以把 Comunicados 的 PDF 一并存下来。）"}
        </p>
      ) : (
        <p className="mt-3 border-t border-[#eef1f2] pt-3 text-xs text-[#64717c]">预览模式，一条都没有写入 Supabase。</p>
      )}
    </div>
  );
}

export function ImportAntaqForm() {
  const [years, setYears] = useState("3");
  const [write, setWrite] = useState(false);
  const [documents, setDocuments] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AntaqIngestResult | null>(null);
  const [error, setError] = useState<AntaqError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const yearCount = Number(years);
  const validYears = Number.isInteger(yearCount) && yearCount >= 0;
  const cliCommand = `npm run ingest:antaq -- --years ${validYears ? yearCount : 3}${write && documents ? " --documents" : ""}${write ? " --write" : ""}`;

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
    if (!validYears) return;
    if (write && !confirm(`确定要把 ANTAQ 的港口特许经营听证写入 Supabase 吗？（${yearCount === 0 ? "不设窗口" : `${yearCount} 年内的场次`}）`)) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-antaq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ years: yearCount, write, documents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error ?? `HTTP ${res.status}`, cliCommand: data.cliCommand, unreachable: data.unreachable });
        return;
      }
      setResult(data as AntaqIngestResult);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err), cliCommand });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Brasil · PNCP 之外</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">ANTAQ — 港口特许经营 · 公开听证阶段</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        巴西水运管理局在港口特许经营（concessão）和码头租赁（arrendamento）开拍<strong>前 6–8 周</strong>开公开听证，
        把<strong>招标文件草案、合同草案和可行性研究（EVTEA）</strong>一次全部公开征求意见。
        特许经营<strong>不是采购</strong>，所以 PNCP 上结构性地没有这类项目 —— 这是另一个口子。
      </p>
      <p className="mt-2 text-sm text-[#52636e]">
        对中资企业来说，听证阶段恰恰是能用的那个阶段：拿到拍卖公告时条款已经定死、时间也不够了，
        而听证给的是能读葡语文件、算账、组联合体的那几个星期。
      </p>

      {/*
        The question this panel was built to answer (user, 2026-09-20: 跑的时候
        会获取项目信息？网站链接？标书地址？还是会缺什么？). Every row is a
        measurement from the five captured pages, not an expectation.
      */}
      <section className="mt-4 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-4 py-3 text-xs leading-6 text-[#52636e]">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b86e00]">跑一趟能拿到什么</h3>

        <h4 className="mt-2 font-black text-[#0a6b3d]">✓ 拿得到</h4>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li><strong>项目是什么</strong> —— 葡语一句话说明（不是编号），加上完整的「1. Objetivo」段落</li>
          <li><strong>完整日程（cronograma）</strong> —— 征询期起止、线上听证会、现场听证会的时间地点，原文照录</li>
          <li><strong>听证编号和港区代码</strong> —— 例如 <code className="font-mono">AP 07/2026</code>、<code className="font-mono">ITJ01</code></li>
          <li><strong>听证页链接</strong> —— 直达 gov.br 官方页面</li>
          <li><strong>征询意见截止日</strong> —— 存为「关键日期」里的问询截止，不是交标截止</li>
          <li><strong>公告附件 PDF</strong>（Comunicados）—— 每场 5–9 个，实测 21/21 可直接下载；勾选后进「待补文件」</li>
          <li><strong>行业标签 + 分级</strong> —— 这个来源自带国家级重点标记，一律 flagship</li>
        </ul>

        <h4 className="mt-3 font-black text-[#8a2b2b]">✗ 拿不到（是页面本来就没有，不是没抓到）</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <strong>金额 —— 一分钱都没有。</strong>五个页面全部核对过：没有上限价、没有参考价、没有 CAPEX。
            投资额在 <strong>EVTEA 那份 PDF 里面</strong>，是另一份文档。
            所以这些项目在库里一律显示「无金额」，<strong>这是正常的，重跑一百次也不会变</strong> ——
            跟 PNCP 那边「取金额被拒、重跑能补上」完全是两回事。
          </li>
          <li>
            <strong>交标截止日 —— 因为还没开标。</strong>这是征询阶段，拍卖公告还没发布，连日期都还没有。
            所以项目状态一律是<strong>「计划中」</strong>，交标日期留空。
            （留空是故意的：填成征询截止日的话，平台的「已过交标日期就不写库」规则会把这些项目全部丢掉。）
          </li>
        </ul>

        <h4 className="mt-3 font-black text-[#7a5200]">⚠ 拿得到链接，但不入库：招标文件草案和 EVTEA</h4>
        <p className="mt-1">
          <code className="font-mono">Minutas de Edital e Contrato</code>、<code className="font-mono">EVTEA</code>、
          <code className="font-mono">Diretrizes do projeto</code> 这几个按钮的地址能抓到，运行结果里会列出来可以点，
          但<strong>不会写进标书下载链接</strong> —— 因为它们是<strong>落地页面，不是文件</strong>。
          写进去的话，订户在「待补文件」点下载会拿到一个网页。
          真要把这几页后面的文件抓下来，得再写一层解析器，而那一层<strong>必须照着真实抓取的页面写</strong>，
          目前还没抓过那种页面。<strong>现阶段请手动点进去下载。</strong>
        </p>
      </section>

      <section className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-4 py-3 text-xs leading-6 text-[#52636e]">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b86e00]">建议多久跑一次</h3>
        <p className="mt-1 text-[#233846]">
          <strong>每周一次就够了，不需要每天。</strong>
        </p>
        <p className="mt-1">
          ANTAQ 一年在 gov.br 上只开七八场听证 —— 平均<strong>六到八周才有一场新的</strong>，
          每天跑只是把同样 6 个页面重新读一遍。
        </p>
        <p className="mt-1">
          但也<strong>不能几个月才跑一次</strong>：ANTAQ 会在听证页上持续补文件（例如伊塔雅伊那场在 2026-07 补了
          「TCU 审后修订版文件」和 Data Room），而征询期通常只有 6–8 周。每周跑一次，
          最坏情况也能在一场新听证开始后一周内看到它，还剩五六周准备时间。
        </p>
        <p className="mt-1">
          按 <code className="font-mono">slug</code> 覆盖写入，重跑安全 —— 日程和附件会一起刷新。
        </p>
        <p className="mt-1">
          <strong>没有进每日自动导入</strong>，只能在这一页或命令行手动跑。
        </p>
      </section>

      <section className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-4 py-3 text-xs leading-6 text-[#52636e]">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b86e00]">另外两件要知道的</h3>
        <p className="mt-1">
          <strong>一、只覆盖 ANTAQ 的三分之一。</strong>「进行中」那一页列 20 场，只有 <strong>6 场</strong>在
          <code className="font-mono"> www.gov.br</code> 上能读；另外 14 场在
          <code className="font-mono"> sisapinternet</code> 和 <code className="font-mono">leilao.antaq</code> 上，
          全是 Cloudflare 验证页 ——<strong>笔记本和跑批机两台机器、六次尝试，一条都没过（2026-09-20 实测）</strong>。
          每次运行都会按域名报一遍这个缺口，免得 6 场看起来像是全部。
        </p>
        <p className="mt-1">
          <strong>二、窗口按场次号里的年份算，不按页面发布日。</strong>
          ANTAQ 用的是 Plone，页面一改就重新盖发布日期的章 —— 有一场 2024 年的听证，页面写着 2026-07-06 发布。
          所以窗口量的是<strong>听证自己的年龄</strong>（<code className="font-mono">07/2026</code> 里那个 2026），
          页面日期跟它对不上时只会在结果里打一行 ⚠ 提示，不参与判断。
          某场听证如果编号旧但<strong>自己排的日程还在往后走</strong>，会被捞回来并注明原因。
        </p>
      </section>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">往回捞几年的场次（0 = 不限）</span>
          <input
            type="number"
            min={0}
            value={years}
            onChange={(e) => setYears(e.target.value)}
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
            checked={documents}
            disabled={!write}
            onChange={(e) => setDocuments(e.target.checked)}
            className="size-4 accent-[#ffb21c]"
          />
          记录公告附件（Comunicados 的 PDF，之后在「待补文件」可下载）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running || !validYears}
          className="mb-0.5 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
      </div>

      <p className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-3 py-2 text-xs leading-5 text-[#52636e]">
        一趟只读 6 个听证页（3 个并发），正常<strong>几秒钟</strong>就跑完 ——
        没有 PNCP 那种逐条取金额的第二趟，因为听证页上根本没有金额。
        默认 <strong>3 年</strong>：港口特许经营要走「征询 → TCU 审 → 开拍」，窗口太窄会把快要开拍的那些丢掉。
      </p>

      <div className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-3 py-2.5">
        <p className="text-[11px] font-black text-[#52636e]">在自己的电脑上跑（参数跟上面同步）</p>
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
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] font-bold text-[#0a5c8a] underline"
        >
          打开 ANTAQ「进行中」听证列表 ↗
        </a>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p>{error.message}</p>
          {/*
            The distinction the whole connector is built around. gov.br
            discriminates by network — it answers the laptop and the GitHub
            runner while leilao.antaq refuses all three — so a failure here may
            mean this deployment is refused, and that reads exactly like an
            empty source unless it is said out loud.
          */}
          {error.unreachable && (
            <p className="mt-1 font-black text-[#8a2b2b]">
              这是「够不着」，不是「没有听证」—— 线上部署这台机器没能连上 gov.br。
              换在自己电脑上跑同一条命令即可，笔记本实测是通的。
            </p>
          )}
          {error.cliCommand && (
            <div className="mt-2 border-t border-red-200 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#071826]">
                  {error.cliCommand}
                </code>
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
