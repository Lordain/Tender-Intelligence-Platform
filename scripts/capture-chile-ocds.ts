/**
 * Captures the real Chilean bytes every Chile test is written against.
 *
 * Phase 1 (`probe:chile-doors`) answered "where is the door". This answers
 * "what comes through it", and it is a separate script for the same reason
 * capture-antaq.ts and capture-dou.ts are: a fixture nobody can re-capture is
 * a fixture nobody can check, and the day Mercado Público changes a field name
 * the only useful question is "what does it send NOW" — which is one command,
 * not an archaeology session.
 *
 * Read-only. No Supabase, no model calls, no writes outside __fixtures__.
 *
 * Usage:
 *   npm run capture:chile-ocds
 *
 * ── What each fixture is for ──────────────────────────────────────────────
 *
 * Four of the six are TRAPS, not happy paths, and they are the reason this
 * script exists at all. Every one of them returns a status a careless reader
 * scores as success:
 *
 *   ocds-index-2026-07.json        the happy path — one page of the monthly index
 *   ocds-index-2026-08-empty.json  HTTP 200 carrying {"status":404} in the BODY
 *   ocds-tender-priced.json        a full record that has tender.value
 *   ocds-tender-unpriced.json      a full record that has NO tender.value (48% of them)
 *   servicios-ticket-required.json HTTP 203 — a 2xx — meaning "Ticket no válido"
 *   ficha-qs-plain-code.html       HTTP 200, 121KB, and every field EMPTY
 *
 * The last one deserves its own sentence. `DetailsAcquisition.aspx?qs=<code>`
 * answers 200 with a full-looking page that contains the tender code, and a
 * check for "did the page come back, and does it mention the code" passes it.
 * The page is a shell: `lblNombreLicitacion` is an empty span. The form that
 * actually works is `?idlicitacion=<code>`, which the server itself redirects
 * to a `?qs=<encrypted>` token. Both were measured on 2026-09-24; see
 * chile-ocds-mapper.ts for the numbers and scripts/test-chile-ocds-mapper.ts
 * for the assertions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CHILE_FICHA_TRAP_URL,
  chileOcdsIndexUrl,
  chileOcdsTenderUrl,
  CHILE_OCDS_HEADERS,
  MERCADO_PUBLICO_TICKET_PROBE_URL,
} from "@/lib/ingestion/connectors/chile-ocds-live";

const FIXTURE_DIR = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");

/**
 * The two records captured in full.
 *
 * Both are real codes from the 2026-07 index, and they are pinned by code
 * rather than by "whatever is first today" on purpose: a fixture that changes
 * identity between captures cannot pin a mapping. `priced` carries a
 * tender.value, `unpriced` does not — and the unpriced case is not an edge
 * case here, it is 48% of the feed (57 of 120 sampled, 2026-09-24).
 */
const CAPTURES: { file: string; url: string; what: string }[] = [
  {
    file: "ocds-index-2026-07.json",
    url: chileOcdsIndexUrl(2026, 7, 0, 10),
    what: "月度索引的一页（最新一个有数据的月份）",
  },
  {
    file: "ocds-index-2026-08-empty.json",
    url: chileOcdsIndexUrl(2026, 8, 0, 10),
    what: "★ 陷阱：HTTP 200，正文里却写着 status 404",
  },
  {
    file: "ocds-tender-priced.json",
    url: chileOcdsTenderUrl("1211839-44-LE26"),
    what: "一条完整记录，有 tender.value",
  },
  {
    file: "ocds-tender-unpriced.json",
    url: chileOcdsTenderUrl("5839-3-LP26"),
    what: "一条完整记录，没有 tender.value（占样本的 48%）",
  },
  {
    file: "servicios-ticket-required.json",
    url: MERCADO_PUBLICO_TICKET_PROBE_URL,
    what: "★ 陷阱：HTTP 203（2xx！），正文是「Ticket no válido」",
  },
  {
    file: "ficha-qs-plain-code.html",
    url: CHILE_FICHA_TRAP_URL,
    what: "★ 陷阱：HTTP 200、121KB、字段全空的空壳页",
  },
];

async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const capture of CAPTURES) {
    const started = Date.now();
    const response = await fetch(capture.url, { headers: CHILE_OCDS_HEADERS, cache: "no-store", redirect: "follow" });
    const body = await response.text();
    writeFileSync(path.join(FIXTURE_DIR, capture.file), body, "utf-8");
    // The STATUS is printed next to every line because for four of these six
    // the status is the lie — a reader who sees "200" and stops reading is the
    // exact failure these fixtures exist to prevent.
    console.log(
      `  ${capture.file.padEnd(34)}http=${String(response.status).padEnd(4)}${String(body.length).padStart(7)}B  ${Date.now() - started}ms  ${capture.what}`,
    );
    // Polite spacing against a public government API we are not paying for.
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  console.log(`\n存到 ${path.relative(process.cwd(), FIXTURE_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
