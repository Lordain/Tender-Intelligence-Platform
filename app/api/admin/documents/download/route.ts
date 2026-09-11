import AdmZip from "adm-zip";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { fetchDocumentLinksForSlugs, type StoredDocumentLink } from "@/lib/ingestion/document-links";

/**
 * Backs the 批量下载标书 button on /admin/documents-needed: given a set of
 * tender slugs, downloads each one's official bid documents from the
 * government source and streams them back as a single ZIP.
 *
 * Why a ZIP straight to the browser rather than a storage bucket: the files
 * are only ever an input to the 批量分析 panel right next to this button,
 * which takes local file uploads. Putting them in Supabase Storage first
 * would add a bucket, a retention policy and a re-download step to reach
 * exactly the same place — and the site deliberately never re-serves tender
 * documents to its own users (see colombia-documents-connector.ts's header).
 *
 * Coverage is per-source and honest about it: only tenders whose ingestion
 * captured real per-document URLs have anything to download. Today that is
 * Peru's SEACE/OECE feed, whose OCDS records carry them inline. Compras MX
 * is anti-bot gated and will never be automatable this way; Colombia's SECOP
 * II is automatable but its proceso-id matching against our stored tenders is
 * still unproven (0 of 499 candidates matched on the first real run), so it
 * is not wired up yet rather than wired up and silently returning nothing.
 */
export const maxDuration = 60;

/** Mirrors MAX_DOWNLOAD_SELECTION on the client — a bigger batch does not fit in maxDuration. */
const MAX_TENDERS = 10;
const MAX_FILES = 40;
/** One oversized attachment must not eat the whole budget; 40MB is already well past any real Bases PDF seen. */
const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** Total ZIP ceiling — a response much larger than this will not finish inside maxDuration anyway. */
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const PER_FILE_TIMEOUT_MS = 20_000;
/** Government file servers throttle; four at a time is fast without looking like a scrape. */
const CONCURRENCY = 4;

/**
 * Same honest-identification posture as the OECE index fetch (see
 * peru-oece-live.ts's fetchOece): .gob.pe answers 403 to a request carrying
 * no User-Agent at all, which is what Node's fetch sends.
 */
const DOWNLOAD_HEADERS = {
  "User-Agent":
    "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
  "Accept-Language": "es-PE,es;q=0.9",
} as const;

type FileOutcome = { slug: string; fileName: string; ok: boolean; bytes?: number; error?: string };

const UNSAFE_PATH_CHARS = /[\\/:*?"<>|]/g;

function zipSafe(segment: string): string {
  return segment.replace(UNSAFE_PATH_CHARS, "-").trim().slice(0, 120) || "unnamed";
}

/** Appends " (2)", " (3)", ... before the extension until the path is free. */
function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  const extension = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${extension}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

async function downloadOne(link: StoredDocumentLink): Promise<{ outcome: FileOutcome; buffer?: Buffer }> {
  const base: FileOutcome = { slug: link.slug, fileName: link.fileName, ok: false };
  try {
    const response = await fetch(link.sourceUrl, {
      headers: DOWNLOAD_HEADERS,
      signal: AbortSignal.timeout(PER_FILE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { outcome: { ...base, error: `HTTP ${response.status} ${response.statusText}` } };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) return { outcome: { ...base, error: "空文件（0 字节）" } };
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return { outcome: { ...base, error: `单个文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB，已跳过` } };
    }
    return { outcome: { ...base, ok: true, bytes: buffer.byteLength }, buffer };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { outcome: { ...base, error: /timed out|abort/i.test(message) ? "下载超时" : message } };
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { slugs?: unknown };
  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((slug): slug is string => typeof slug === "string") : [];
  if (slugs.length === 0) return NextResponse.json({ error: "没有选择任何项目。" }, { status: 400 });
  if (slugs.length > MAX_TENDERS) {
    return NextResponse.json({ error: `一次最多下载 ${MAX_TENDERS} 个项目的标书。` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  let bySlug: Map<string, StoredDocumentLink[]>;
  try {
    bySlug = await fetchDocumentLinksForSlugs(supabase, slugs);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const links = slugs.flatMap((slug) => bySlug.get(slug) ?? []).slice(0, MAX_FILES);
  if (links.length === 0) {
    // A 409 rather than an empty ZIP: an empty archive downloads perfectly
    // happily and looks like a broken feature, when the real answer is that
    // these tenders have no machine-readable document links at all.
    return NextResponse.json(
      {
        error:
          "所选项目都没有可自动下载的官方标书链接。目前只有秘鲁 SEACE/OECE 的项目带链接（且需要在本次改动之后重新导入过）；" +
          "墨西哥 Compras MX 有反爬限制，哥伦比亚 SECOP II 的编号匹配尚未验证，这两个来源仍然要手动下载。",
        slugsWithoutLinks: slugs,
      },
      { status: 409 },
    );
  }

  const outcomes: FileOutcome[] = [];
  const zip = new AdmZip();
  let totalBytes = 0;
  // Two documents under one tender genuinely share a name — a real record in
  // the fixture carries "Bases Administrativas.pdf" for both the original and
  // an amended publication — and adding the same path to the archive twice
  // makes one of them unreachable.
  const usedPaths = new Set<string>();
  // Sequential batches of CONCURRENCY rather than one Promise.all over
  // everything: the byte ceiling has to be checked against work already
  // finished, and firing all 40 at once would blow past it before the first
  // check runs.
  for (let from = 0; from < links.length; from += CONCURRENCY) {
    if (totalBytes >= MAX_TOTAL_BYTES) {
      for (const link of links.slice(from)) {
        outcomes.push({ slug: link.slug, fileName: link.fileName, ok: false, error: "已达到本次下载总大小上限，未下载" });
      }
      break;
    }
    const results = await Promise.all(links.slice(from, from + CONCURRENCY).map(downloadOne));
    for (const { outcome, buffer } of results) {
      outcomes.push(outcome);
      if (!buffer) continue;
      totalBytes += buffer.byteLength;
      // One folder per tender: the 批量分析 panel takes files per tender, and
      // a flat archive holding "Bases Administrativas.pdf" eight times over
      // would be unusable.
      zip.addFile(uniquePath(`${zipSafe(outcome.slug)}/${zipSafe(outcome.fileName)}`, usedPaths), buffer);
    }
  }

  const okCount = outcomes.filter((outcome) => outcome.ok).length;
  const missing = slugs.filter((slug) => (bySlug.get(slug) ?? []).length === 0);
  const report = [
    `下载时间：${new Date().toISOString()}`,
    `选中项目：${slugs.length} 个`,
    `找到官方链接：${links.length} 个文件`,
    `下载成功：${okCount} 个（${(totalBytes / 1024 / 1024).toFixed(1)} MB）`,
    "",
    ...outcomes.map((outcome) =>
      outcome.ok
        ? `[OK] ${outcome.slug} / ${outcome.fileName}（${((outcome.bytes ?? 0) / 1024).toFixed(0)} KB）`
        : `[失败] ${outcome.slug} / ${outcome.fileName} — ${outcome.error}`,
    ),
    ...(missing.length > 0 ? ["", ...missing.map((slug) => `[无链接] ${slug}：这条项目没有已记录的官方标书链接，需要手动下载。`)] : []),
  ].join("\n");
  // Always included, even on a fully successful run: once the browser has
  // taken the ZIP away, this file is the only way to tell "this tender
  // genuinely has one document" from "three of its four downloads failed".
  zip.addFile("下载报告.txt", Buffer.from(report, "utf8"));

  const archive = zip.toBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(archive.byteLength),
      "Content-Disposition": `attachment; filename="tender-documents-${stamp}.zip"`,
      // Counts the client shows in its status line without re-parsing the ZIP.
      "X-Download-Total": String(links.length),
      "X-Download-Ok": String(okCount),
    },
  });
}
