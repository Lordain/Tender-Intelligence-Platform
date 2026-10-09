/**
 * setAsideLargeProjects (download-argentina-docs.ts): a project with any file
 * over the limit moves whole to the large folder; the others stay; the report
 * says so. The first-40-pages copy needs poppler and is checked only where
 * pdfseparate is installed (the GitHub runner installs it).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { setAsideLargeProjects } from "../lib/ingestion/set-aside-large-projects";

const failures: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
};

async function main() {
  const root = mkdtempSync(join(tmpdir(), "set-aside-"));
  const out = join(root, "main");
  const large = join(root, "large");
  execFileSync("mkdir", ["-p", out]);
  try {
    // A 60-page PDF, padded past the 4 KB limit used here.
    const doc = await PDFDocument.create();
    for (let i = 0; i < 60; i++) doc.addPage().drawText(`page ${i + 1} ${"x".repeat(200)}`);
    writeFileSync(join(out, "argentina-comprar-big__TOMO III.pdf"), await doc.save());
    writeFileSync(join(out, "argentina-comprar-big__Condiciones.pdf"), "small");
    writeFileSync(join(out, "argentina-comprar-small__Clausulas.pdf"), "small");
    writeFileSync(join(out, "下载报告.txt"), "header\n");

    const lines = setAsideLargeProjects(out, large, 4 * 1024);

    const mainFiles = readdirSync(out);
    const largeFiles = existsSync(large) ? readdirSync(large) : [];
    check("the large project's files all move", largeFiles.includes("argentina-comprar-big__TOMO III.pdf") && largeFiles.includes("argentina-comprar-big__Condiciones.pdf"));
    check("a small project stays in the main folder", mainFiles.includes("argentina-comprar-small__Clausulas.pdf") && !largeFiles.some((f) => f.startsWith("argentina-comprar-small")));
    check("no full-size file of the large project is left in main", !mainFiles.includes("argentina-comprar-big__TOMO III.pdf") && !mainFiles.includes("argentina-comprar-big__Condiciones.pdf"));
    check("the report names the project", readFileSync(join(out, "下载报告.txt"), "utf8").includes("argentina-comprar-big（2 个文件") && lines.length > 0);

    let hasPoppler = true;
    try { execFileSync("which", ["pdfseparate"], { stdio: "pipe" }); } catch { hasPoppler = false; }
    if (hasPoppler) {
      const kept = mainFiles.find((f) => f.startsWith("argentina-comprar-big__TOMO III - 前40页"));
      check("the oversized PDF leaves its first 40 pages in main, slug-prefixed", kept !== undefined);
      if (kept) check("the kept copy has 40 pages", (await PDFDocument.load(readFileSync(join(out, kept)))).getPageCount() === 40);
    } else {
      console.log("SKIP first-40-pages copy (no poppler here; the workflow installs it)");
      check("without poppler the report says the pages could not be cut", lines.some((l) => l.includes("未能截取前几页")));
    }

    check("nothing over the limit → nothing moves", setAsideLargeProjects(out, join(root, "large2"), 1024 * 1024 * 1024).length === 0 && !existsSync(join(root, "large2")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  if (failures.length > 0) { console.error(`\n${failures.length} failed`); process.exit(1); }
  console.log("\nAll checks passed.");
}

main();
