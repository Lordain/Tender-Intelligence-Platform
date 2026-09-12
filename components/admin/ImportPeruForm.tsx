"use client";

import { useState } from "react";

/**
 * The 秘鲁 tab of 新项目清单. Two panels, because Peru has two live sources
 * and they are different procurement systems, not two halves of one feed —
 * see lib/ingestion/ingest-peru.ts.
 *
 * Neither needs a file upload: both fetch live. That is the whole difference
 * from the Mexico tab, and it is why this form has no <input type="file">.
 */
type TierCounts = { flagship: number; significant: number; standard: number; excluded: number };

type PeruResult = {
  source: "oece" | "oxi";
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  surfacedCount: number;
  tierCounts: TierCounts;
  segments?: string[];
  write: boolean;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  /** OECE only — the OxI export carries no per-document URLs. Feeds 批量下载标书 on /admin/documents-needed. */
  documentLinks?: { tenders: number; links: number };
  sample: { slug: string; tenderNumber: string; title: { es: string }; estimatedValue?: number; currency?: string; relevance: { tier: string } }[];
};

const TIER_LABELS: [keyof TierCounts, string][] = [
  ["flagship", "重点大项目"],
  ["significant", "重要项目"],
  ["standard", "常规项目"],
  ["excluded", "已过滤"],
];

function ResultPanel({ result }: { result: PeruResult }) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
      <p className="text-sm font-bold text-[#071826]">
        抓取 {result.fetchedCount} 条 → 映射 {result.mappedCount} 条 → 时间窗内 {result.keptAfterRecencyCount} 条 →{" "}
        <span className="text-[#b86e00]">进入推荐 {result.surfacedCount} 条</span>
        {result.segments && result.segments.length > 0 && (
          <span className="font-normal text-[#64717c]">（月份段：{result.segments.join("、")}）</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#52636e]">
        {TIER_LABELS.map(([tier, label]) => (
          <span key={tier}>
            {label} <strong className="text-[#071826]">{result.tierCounts[tier]}</strong>
          </span>
        ))}
      </div>
      {result.write ? (
        <p className="mt-2 text-xs text-[#233846]">
          已写入 Supabase {result.upsertedCount ?? 0} 条
          {result.skippedExcludedCount ? `，跳过已过滤 ${result.skippedExcludedCount} 条` : ""}
          {result.failed && result.failed.length > 0 ? `，失败 ${result.failed.length} 条` : ""}。
        </p>
      ) : null}
      {result.write && result.documentLinks && result.documentLinks.links > 0 ? (
        <p className="mt-1 text-xs text-[#233846]">
          同时记录了 <strong>{result.documentLinks.links}</strong> 份官方标书链接（覆盖 {result.documentLinks.tenders} 个项目）——
          去「待补文件项目」页勾选后可一键打包下载。
        </p>
      ) : null}
      {result.write ? null : <p className="mt-2 text-xs text-[#64717c]">预览模式，没有写入 Supabase。</p>}
      {result.failed && result.failed.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-700">
          {result.failed.slice(0, 5).map((f) => (
            <li key={f.slug}>
              {f.slug}: {f.error}
            </li>
          ))}
        </ul>
      )}
      {result.sample.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[#eef1f2] pt-3 text-xs text-[#233846]">
          {result.sample.map((t) => (
            <li key={t.slug} className="truncate">
              <span className="font-mono text-[#64717c]">{t.relevance.tier}</span>{" "}
              {t.estimatedValue ? `${t.currency ?? ""} ${Math.round(t.estimatedValue).toLocaleString()}` : "无金额"} · {t.title.es}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * An import failure, and — when the failure is Peru refusing this deployment's
 * IP range — the command that does work, built from the settings just
 * submitted.
 *
 * Confirmed 2026-09-11: SEACE's proxy denies Vercel's datacenter range
 * (`iad1`) outright. Nothing about the request changes that, so repeating
 * "403 Forbidden" at the admin and stopping would leave them to work out the
 * flags by hand every time.
 */
function ErrorPanel({
  error,
  copied,
  onCopy,
}: {
  error: { message: string; cliCommand?: string };
  copied: string | null;
  onCopy: (command: string) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <p>{error.message}</p>
      {error.cliCommand && (
        <div className="mt-2 border-t border-red-200 pt-2">
          <p className="font-black text-[#8a2b2b]">在你自己的电脑上跑这条命令，参数已按上面的设置填好：</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#071826]">
              {error.cliCommand}
            </code>
            <button
              type="button"
              onClick={() => onCopy(error.cliCommand!)}
              className="h-7 shrink-0 rounded-lg border border-red-300 bg-white px-2.5 text-[11px] font-black text-[#8a2b2b] transition-colors hover:bg-red-100"
            >
              {copied === error.cliCommand ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The command that always works for this source, kept on screen rather than
 * only appearing after a failure.
 *
 * SEACE refuses this deployment's IP range, so on the live site the button is
 * guaranteed to fail and the CLI is the real path — waiting for the error to
 * hand over the command means every import starts with a failed request
 * (user, 2026-09-12: 帮我把这条命令加在后台新项目清单->秘鲁，可以直接复制).
 * Built from the same flags the API route builds it from, so the two cannot
 * drift.
 */
function peruCliCommand(options: { days: string; write: boolean }): string {
  return `npm run ingest:peru-live -- --days ${Number(options.days) || 5}${options.write ? " --write" : ""}`;
}

function CommandBox({ days, copied, onCopy }: { days: string; copied: string | null; onCopy: (command: string) => void }) {
  // Both spellings, always. Tying the one visible command to the 写入 checkbox
  // meant the command you wanted was usually the one not on screen — and the
  // difference between them is the whole difference between a rehearsal and a
  // real import, so it should be two things you can see and choose between.
  const rows: { label: string; command: string; emphasis?: boolean }[] = [
    { label: "先预览（不写库，另存 CSV 到 exports/）", command: peruCliCommand({ days, write: false }) },
    { label: "确认没问题后，真正写入", command: peruCliCommand({ days, write: true }), emphasis: true },
    // A different job, not a third variant of the import: it adds no
    // tenders. SEACE's records gain an `awards` array once the buena pro is
    // granted, but a tender published in March lives in March's segment,
    // which no "last N days" run ever asks for again — so an award landing
    // there is invisible until something goes back and looks.
    {
      label: "另外：检查旧项目有没有中标（不新增项目，只更新状态）",
      command: "npm run ingest:peru-live -- --refresh-open --write",
    },
  ];

  return (
    <div className="mt-3 rounded-xl border border-[#d8e0e3] bg-[#f7f9f9] px-3 py-2.5">
      <p className="text-[11px] font-black text-[#52636e]">在自己的电脑上跑（天数跟上面的设置同步）</p>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.command}>
            <p className={`text-[11px] ${row.emphasis ? "font-black text-[#7a5200]" : "text-[#75838c]"}`}>{row.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#071826]">{row.command}</code>
              <button
                type="button"
                onClick={() => onCopy(row.command)}
                className="h-7 shrink-0 rounded-lg border border-[#cbd6da] bg-white px-2.5 text-[11px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
              >
                {copied === row.command ? "已复制" : "复制"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImportPeruForm() {
  const [days, setDays] = useState("5");
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState<"oece" | "oxi" | null>(null);
  const [results, setResults] = useState<Partial<Record<"oece" | "oxi", PeruResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<"oece" | "oxi", { message: string; cliCommand?: string }>>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions) — the
      // command is on screen and selectable either way, so this is not worth
      // an alert.
    }
  }

  async function run(source: "oece" | "oxi") {
    if (write && !confirm(`确定要把${source === "oece" ? " SEACE/OECE " : " Obras por Impuestos "}的秘鲁标书写入 Supabase 吗？`)) return;
    setRunning(source);
    setErrors((prev) => ({ ...prev, [source]: undefined }));
    try {
      const res = await fetch("/api/admin/import-peru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          write,
          days: Number(days) || 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Peru blocks this deployment's egress; the route replies with the
        // command that works instead of leaving it as a dead error.
        setErrors((prev) => ({
          ...prev,
          [source]: { message: data.error ?? `HTTP ${res.status}`, cliCommand: data.cliCommand },
        }));
        return;
      }
      setResults((prev) => ({ ...prev, [source]: data as PeruResult }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [source]: { message: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">共用设置</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
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
        </div>
        <p className="mt-2 text-xs text-[#64717c]">
          天数自己决定要抓哪几个月份段——SEACE 的官方接口只能<strong>按整月</strong>取数，所以跨月的窗口会自动多抓一个月
          （例如 9 月 3 日选最近 5 天，会把 8 月也抓上，否则 8/29–8/31 会静默丢掉）。想要整月就填 30。
        </p>
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Perú · 主渠道</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">SEACE / OECE — 常规预算招标</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          秘鲁绝大部分公共采购走这里，量最大（一个月约 4000 条），约一天延迟。数据里没有投标截止日，链接指向 SEACE 公共检索平台，配合项目编号检索。
        </p>
        <p className="mt-2 rounded-xl border border-[#f0d9a8] bg-[#fff8e9] px-3 py-2 text-xs text-[#7a5200]">
          <strong>线上部署跑不了这个来源。</strong>秘鲁官方接口拒绝机房 IP（已确认 Vercel iad1 返回 403），
          这是对方的访问策略，不绕。<strong>请在自己的电脑上用命令行导入</strong>——下面的按钮如果失败，会直接把填好参数的命令给你复制。
          本地 <code className="font-mono">npm run dev</code> 打开这个页面时按钮是好用的。
        </p>
        <CommandBox days={days} copied={copied} onCopy={copyCommand} />
        {errors.oece && <ErrorPanel error={errors.oece} copied={copied} onCopy={copyCommand} />}
        <button
          type="button"
          onClick={() => run("oece")}
          disabled={running !== null}
          className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running === "oece" ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
        {results.oece && <ResultPanel result={results.oece} />}
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Perú · 补充渠道</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">ProInversión — Obras por Impuestos（税收抵扣工程）</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          量小但质量高（约 400 条在招，保留率约 40%），<strong>有真实投标截止日</strong>，每条都带官方单项目链接。
          投标方需为秘鲁纳税主体——每条项目会自动挂一条机制提示。
        </p>
        {errors.oxi && <ErrorPanel error={errors.oxi} copied={copied} onCopy={copyCommand} />}
        <button
          type="button"
          onClick={() => run("oxi")}
          disabled={running !== null}
          className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running === "oxi" ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
        {results.oxi && <ResultPanel result={results.oxi} />}
      </div>
    </div>
  );
}
