import { appendFileSync, copyFileSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { truncatePdfToPages } from "@/lib/ingestion/pdf-pages";

const REPORT = "下载报告.txt";
/** The first pages an oversized PDF keeps in the main folder — maxPagesForTier("flagship"). */
const KEPT_PAGES = 40;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * For download-argentina-docs.ts. Sets aside every PROJECT holding a file over the limit (2026-10-09, user:
 * 识别到特别大标书项目，可以单独归纳成一份单独下载): all of its files move to
 * largeDir, the separate artifact, so the main ZIP stays small enough to
 * download. Each oversized PDF also leaves its first KEPT_PAGES pages in the
 * main folder, under a name that still starts with the tender's slug, so
 * 选择上传 can take it without opening the large download at all.
 */
export function setAsideLargeProjects(outDir: string, largeDir: string, limit: number): string[] {
  const files = readdirSync(outDir).filter((name) => name !== REPORT);
  const slugOf = (name: string) => name.split("__")[0];
  const largeSlugs = new Set(files.filter((name) => statSync(join(outDir, name)).size > limit).map(slugOf));
  if (largeSlugs.size === 0) return [];
  mkdirSync(largeDir, { recursive: true });
  const lines = ["", `含超过 ${mb(limit)} 文件的项目（选择上传放不下）已整体移到另一个压缩包「argentina-bid-documents-large」：`];
  for (const slug of largeSlugs) {
    const own = files.filter((name) => slugOf(name) === slug);
    const total = own.reduce((sum, name) => sum + statSync(join(outDir, name)).size, 0);
    lines.push(`  ${slug}（${own.length} 个文件，共 ${mb(total)}）`);
    for (const name of own) {
      const size = statSync(join(outDir, name)).size;
      const largePath = join(largeDir, name);
      renameSync(join(outDir, name), largePath);
      if (size <= limit || !/\.pdf$/i.test(name)) continue;
      const cut = truncatePdfToPages(largePath, KEPT_PAGES);
      if (cut.truncated) {
        const keptName = name.replace(/\.pdf$/i, ` - 前${cut.usedPages}页.pdf`);
        copyFileSync(cut.path, join(outDir, keptName));
        const keptSize = statSync(join(outDir, keptName)).size;
        lines.push(`    ${name}（${mb(size)}）→ 前 ${cut.usedPages} 页（共 ${cut.originalPages} 页）留在本压缩包：${keptName}（${mb(keptSize)}）${keptSize > limit ? "，仍超过上限，请在本机拆分后再上传" : ""}`);
      } else {
        lines.push(`    ${name}（${mb(size)}）→ 未能截取前几页，请从大文件压缩包取用`);
      }
      cut.cleanup();
    }
  }
  appendFileSync(join(outDir, REPORT), `${lines.join("\n")}\n`);
  return lines;
}
