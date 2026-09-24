/**
 * Captures the real bytes every chile-busca test is written against.
 *
 * Same reason capture-chile-ocds.ts exists: a fixture nobody can re-capture is
 * a fixture nobody can check, and this door needs it more than any other
 * source in this repo — it is ChileCompra's UI, not a published data API, and
 * a release can change the markup without notice. When that happens the only
 * useful question is "what does it send NOW", and that should be one command.
 *
 * Read-only. No Supabase, no model calls, no writes outside __fixtures__.
 *
 * Usage:
 *   npm run capture:chile-busca
 *
 * ── What each fixture is for ──────────────────────────────────────────────
 *
 * Four of the seven are TRAPS. Every one of them is an HTTP 200.
 *
 *   busca-export-small.csv         happy path — a real CSV, 9ish rows, amounts published
 *   busca-export-unpriced.csv      real CSV whose MontoLicitacion is a UTM BRACKET STRING, not a number
 *   busca-export-empty.csv         200, a header row and nothing else — "past the end"
 *   busca-generar-archivo.json     200 {"estado":true,...} — the handle, not the file
 *   busca-generar-refused.json     200 {"estado":false} — a REFUSAL wearing a success code
 *   busca-search-page.html         the HTML fragment, which is the only source of the closing date
 *   busca-descargar-empty.bin      200 and ZERO BYTES — a download without the session cookies
 *
 * The last one deserves its own sentence, because it is the one that would
 * have shipped. `Descargar` with a valid, freshly-minted FileGuid but without
 * the cookies from the GenerarArchivo call answers 200 with an empty body. A
 * check of the form "did the download succeed" passes it, and the importer
 * then reports a clean run of zero rows. The fixture is captured by doing
 * exactly that, on purpose.
 *
 * The small captures use `idTipoFecha: "3"` ("3 meses o más") on purpose: it
 * is a real bucket that genuinely holds only a few dozen rows, so the fixtures
 * are real served bytes AND small enough to read. A trimmed 1,000-row page
 * would be neither.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CHILE_BUSCA_ESTADOS,
  ChileBuscaSession,
  chileBuscaPayload,
  fetchChileBuscaExportPage,
  fetchChileBuscaSearchHtml,
  warmSession,
  type ChileBuscaQuery,
} from "@/lib/ingestion/connectors/chile-busca-live";

const FIXTURE_DIR = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");

function save(file: string, body: string | Buffer): void {
  writeFileSync(path.join(FIXTURE_DIR, file), body);
  const size = typeof body === "string" ? Buffer.byteLength(body) : body.length;
  console.log(`  ✓ ${file}  ${size} 字节`);
}

async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  console.log("抓取智利公开搜索门的真实字节（www.mercadopublico.cl/BuscarLicitacion/）\n");

  const session = await warmSession(new ChileBuscaSession());
  console.log("会话已建立（这一步不是可选的：不带 cookie 的 Descargar 会回 200 + 0 字节）\n");

  // ── 1. The happy path, priced ────────────────────────────────────────────
  const priced: ChileBuscaQuery = { idTipoFecha: "3", esPublicoMontoEstimado: "1", pagina: 1 };
  const pricedPage = await fetchChileBuscaExportPage(session, priced);
  save("busca-export-small.csv", pricedPage.csv);

  // ── 2. The same door, unpriced half — where MontoLicitacion stops being a number
  const unpriced: ChileBuscaQuery = { idTipoFecha: "3", esPublicoMontoEstimado: "0", pagina: 1 };
  save("busca-export-unpriced.csv", (await fetchChileBuscaExportPage(session, unpriced)).csv);

  // ── 3. Past the end: 200, header row, no data. NOT an error, and not the
  //       same thing as the zero-byte body below.
  save("busca-export-empty.csv", (await fetchChileBuscaExportPage(session, { ...priced, pagina: 9 })).csv);

  // ── 4. The GenerarArchivo handle itself, and its refusal twin ────────────
  const generar = await session.request("/Home/GenerarArchivo", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(chileBuscaPayload(priced)),
  });
  save("busca-generar-archivo.json", generar.body);

  // An empty idTipoFecha. The site's own JS can produce this (it collects the
  // checkbox group into an array and sends it raw), so it is not a contrived
  // input — it is what happens when nobody ticks a box.
  const refused = await session.request("/Home/GenerarArchivo", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(chileBuscaPayload({ ...priced, idTipoFecha: "" })),
  });
  save("busca-generar-refused.json", refused.body);

  // ── 5. The zero-byte download, captured on purpose ───────────────────────
  // A brand-new session that has never seen the search page, asking for a
  // GUID minted in the session above. Valid GUID, wrong session, HTTP 200,
  // nothing in it.
  const meta = JSON.parse(generar.body.toString("utf8")) as { FileGuid: string; nombreArchivo: string };
  const stranger = new ChileBuscaSession();
  const empty = await stranger.request(
    `/Home/Descargar?fileGuid=${encodeURIComponent(meta.FileGuid)}&nombreArchivo=${encodeURIComponent(meta.nombreArchivo)}`,
    { method: "GET" },
  );
  save("busca-descargar-empty.bin", empty.body);

  // ── 6. The HTML fragment — the only place the closing date exists ────────
  const html = await fetchChileBuscaSearchHtml(session, {
    idTipoFecha: "1",
    esPublicoMontoEstimado: "1",
    idEstado: CHILE_BUSCA_ESTADOS.publicadas,
    pagina: 1,
  });
  save("busca-search-page.html", html);

  console.log("\n完成。注意这些字节里的日期会随抓取时间变化 —— 测试断言的是结构和陷阱，不是具体某条标的内容。");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
