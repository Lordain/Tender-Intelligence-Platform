import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analysisFileName } from "@/lib/ingestion/analysis-file-name";
import { downloadPortalDocument, parsePortalDocumentUrl, type PortalPageCache } from "@/lib/ingestion/connectors/argentina-portal-live";
import { DOCUMENT_DOWNLOAD_HEADERS, downloadFile } from "@/lib/ingestion/download-file";
import type { StoredDocumentLink } from "@/lib/ingestion/document-links";

/** Per file. The largest volume seen so far is 281 MB (COMPR.AR). */
const MAX_FILE_BYTES = 400 * 1024 * 1024;
const FILE_TIMEOUT_MS = 15 * 60 * 1000;
const STALL_MS = 120_000;

type Row = { slug: string; tender_number: string };

async function downloadOnce(link: StoredDocumentLink, pages: PortalPageCache) {
  if (parsePortalDocumentUrl(link.sourceUrl)) {
    return downloadPortalDocument(link.sourceUrl, { maxBytes: MAX_FILE_BYTES, timeoutMs: FILE_TIMEOUT_MS }, pages);
  }
  return downloadFile(link.sourceUrl, {
    budgetMs: FILE_TIMEOUT_MS,
    stallMs: STALL_MS,
    maxBytes: MAX_FILE_BYTES,
    headers: DOCUMENT_DOWNLOAD_HEADERS,
  });
}

/**
 * Downloads every recorded official document of `rows` into `outDir`, one
 * file at a time, and writes 下载报告.txt next to them. Outside Vercel, so
 * no 300 s ceiling: the GitHub runner (download-argentina-docs.yml) and the
 * admin's own computer (npm run download:docs) both call this.
 *
 * Files are named `<slug>__<document>` like 批量下载标书's ZIP, so
 * /admin/local-batch and 选择上传 attach each one to its tender by name.
 * Nothing is written to the database.
 */
export async function downloadTenderDocsToFolder(
  rows: Row[],
  links: Map<string, StoredDocumentLink[]>,
  outDir: string,
  missingLinksHint: string,
): Promise<{ okCount: number; failCount: number }> {
  mkdirSync(outDir, { recursive: true });
  const report: string[] = [`下载时间：${new Date().toISOString()}`, ""];
  let okCount = 0;
  let failCount = 0;

  for (const row of rows) {
    const files = links.get(row.slug) ?? [];
    console.log(`\n${row.tender_number}（${files.length} 个文件）`);
    report.push(`${row.tender_number}  ${row.slug}`);
    if (files.length === 0) {
      report.push(`  [无链接] ${missingLinksHint}`, "");
      continue;
    }
    const pages: PortalPageCache = new Map();
    const used = new Set<string>();
    for (const link of files) {
      const startedAt = Date.now();
      // One retry: both COMPR.AR and SEACE answer the occasional 503 that clears at once.
      let result = await downloadOnce(link, pages);
      if (!result.ok) result = await downloadOnce(link, pages);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
      let name = analysisFileName(row.slug, link.fileName);
      for (let n = 2; used.has(name); n++) name = analysisFileName(row.slug, link.fileName.replace(/(\.[^.]+)?$/, ` (${n})$1`));
      used.add(name);
      if (result.ok) {
        writeFileSync(join(outDir, name), result.buffer);
        okCount += 1;
        const line = `  [OK] ${name}（${(result.bytes / 1024 / 1024).toFixed(1)} MB，${seconds} 秒）`;
        console.log(line);
        report.push(line);
      } else {
        failCount += 1;
        const line = `  [失败] ${name} — ${result.error}`;
        console.log(line);
        report.push(line);
      }
    }
    report.push("");
  }

  report.splice(1, 0, `成功 ${okCount} 个文件，失败 ${failCount} 个。文件名以项目 slug 开头，可直接在「选择上传」或本地批量分析中使用。`);
  writeFileSync(join(outDir, "下载报告.txt"), report.join("\n"));
  console.log(`\n成功 ${okCount} 个，失败 ${failCount} 个。文件在 ${outDir}`);
  return { okCount, failCount };
}
