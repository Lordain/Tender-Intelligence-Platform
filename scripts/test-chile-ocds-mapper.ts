/**
 * The Chile OCDS reader and mapper, against bytes really served by
 * ChileCompra on 2026-09-24.
 *
 * Every fixture here was captured by `npm run capture:chile-ocds` and edited
 * by nobody. That matters more than usual for this source, because four of
 * the six responses carry a status code that does not mean what it says:
 *
 *   ocds-index-2026-08-empty.json    HTTP 200, body says status 404
 *   servicios-ticket-required.json   HTTP 203 — a 2xx — meaning "Ticket no válido"
 *   ficha-qs-plain-code.html         HTTP 200, 121KB, every field empty
 *   (and round 1's gateway 403s, still pinned by test:chile-doors)
 *
 * A mapper tested against hand-written JSON would pass all of them.
 *
 * Usage: npm run test:chile-ocds
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ChileOcdsError,
  ChileTicketRequiredError,
  chileOcdsIndexUrl,
  chileOcdsTenderUrl,
  describeIndexFreshness,
  readIndexPage,
  tenderCodeFromOcid,
} from "@/lib/ingestion/connectors/chile-ocds-live";
import {
  chileBuyerName,
  chileGovernmentLevel,
  chileOcdsPublicUrl,
  chileRegion,
  chileStatus,
  mapChileOcdsPackageToTender,
} from "@/lib/ingestion/chile-ocds-mapper";
import type { OcdsReleasePackage } from "@/lib/ingestion/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`}`);
}
function throws(name: string, fn: () => unknown, matcher: (err: unknown) => boolean) {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  const ok = caught !== undefined && matcher(caught);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      实际抛出 ${String(caught)}`}`);
}

const FIXTURES = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");
const read = (file: string) => readFileSync(path.join(FIXTURES, file), "utf-8");
const readJson = (file: string) => JSON.parse(read(file));

/** Fixed so a deadline assertion does not change meaning with the calendar. */
const NOW = new Date("2026-09-24T12:00:00Z");

// ── 1. URL shapes ─────────────────────────────────────────────────────────
console.log("URL 拼法（两个主机名只差一个 s，拼错就是 404）");

// The ñ is load-bearing: `listaAnoMes` (ASCII) is a real 404 on this host.
check(
  "索引走 apis. 这个主机，月份补零，路由里的 ñ 要编码成 %C3%B1",
  chileOcdsIndexUrl(2026, 7, 0, 10),
  "https://apis.mercadopublico.cl/OCDS/data/listaA%C3%B1oMes/2026/07/0/10",
);
check("单条记录走 api. 这个主机（没有 s）", chileOcdsTenderUrl("1211839-44-LE26"), "https://api.mercadopublico.cl/APISOCDS/OCDS/tender/1211839-44-LE26");
check("ocid 去掉 ChileCompra 的前缀就是 ficha 用的编号", tenderCodeFromOcid("ocds-70d2nz-1211839-44-LE26"), "1211839-44-LE26");

// ── 2. The index, and the two 404s that mean opposite things ──────────────
console.log("\n月度索引（HTTP 200 底下藏着两种完全相反的 404）");

const indexPage = readIndexPage(readJson("ocds-index-2026-07.json"), "2026-07", "(fixture)");
check("2026-07 的索引读得出总数", indexPage.total, 8004);
check("2026-07 的索引读得出这一页的条数", indexPage.entries.length, 10);
check("2026-07 不是空月", indexPage.empty, false);

// The body-level 404: a true statement about the month.
const emptyPage = readIndexPage(readJson("ocds-index-2026-08-empty.json"), "2026-08", "(fixture)");
check("2026-08：正文里的 status 404 要读成「这个月没有记录」", emptyPage.empty, true);
check("空月的总数是 0，不是抛错", emptyPage.total, 0);

// The route-level 404: a statement about US. Must never be silently empty —
// collapsing the two is how a mistyped URL becomes "智利这个月没发标".
throws(
  "路由级的 statusCode 404 必须抛错，不能当成空月",
  () => readIndexPage({ statusCode: 404, message: "Resource not found" }, "2026-09", "(fixture)"),
  (err) => err instanceof ChileOcdsError && /拼法/.test((err as Error).message),
);
throws(
  "应答里没有 data 数组要抛错，不能当成 0 条",
  () => readIndexPage({ pagination: { total: 5 } }, "2026-07", "(fixture)"),
  (err) => err instanceof ChileOcdsError,
);

// ── 3. The HTTP 203 credential envelope ───────────────────────────────────
console.log("\n凭证信封（对方用 HTTP 203 —— 一个 2xx —— 回「Ticket no válido」）");

const ticketBody = readJson("servicios-ticket-required.json");
check("抓到的就是那个信封", [ticketBody.Codigo, ticketBody.Mensaje], [203, "Ticket no válido."]);
// readIndexPage is not where the envelope is caught — getChileJson is — but
// the envelope must not be mistaken for data anywhere, so the index reader is
// asserted to refuse it too rather than reading `data` off it.
throws(
  "凭证信封不能被当成索引数据读",
  () => readIndexPage(ticketBody, "2026-09", "(fixture)"),
  (err) => err instanceof ChileOcdsError,
);
check("ChileTicketRequiredError 是 ChileOcdsError 的子类（调用方可以只 catch 一个）", new ChileTicketRequiredError("x") instanceof ChileOcdsError, true);

// ── 4. A real record, priced ──────────────────────────────────────────────
console.log("\n一条真实记录（有金额的那条）");

const priced = readJson("ocds-tender-priced.json") as OcdsReleasePackage;
const tender = mapChileOcdsPackageToTender(priced, undefined, NOW);
if (!tender) {
  failures += 1;
  console.log("  ✗ 有金额的那条记录映射出 null");
} else {
  check("编号用的是 tender.id，不是带前缀的 ocid", tender.tenderNumber, "1211839-44-LE26");
  check("slug", tender.slug, "chile-1211839-44-le26");
  check("国家写死 Chile", tender.country, "Chile");
  check("标题", tender.title.es, "MAQUINARIAS DE ASEO CLÍNICO");
  // The measured reason this mapper exists: parties[].name is
  // "CORP MUNIC EDUC SALUD Y ATENCION | CORP MUNIC EDUC SALUD Y ATENCION".
  check("采购单位取 identifier.legalName，不取带「 | 」的 name", tender.buyer, "CORP MUNIC EDUC SALUD Y ATENCION");
  check("采购单位名里不能再有「 | 」", tender.buyer.includes(" | "), false);
  check("发布日期", tender.publicationDate, "2026-07-03T14:56:43Z");
  check("交标截止时间", tender.submissionDeadline, "2026-07-08T16:00:00Z");
  check("金额", tender.estimatedValue, 50000000);
  check("币种", tender.currency, "CLP");
  check("地区（源数据里 58/120 条带尾随空格）", tender.location, "Región Metropolitana de Santiago");
  check("采购方式原文", tender.procedureType, "Licitación Pública Entre 100 y 1000 UTM (LE)");
  // THE one that would have been silent: the source says status "active".
  check("源数据自称的状态（就是这条让通用 OCDS 映射器不能直接用）", priced.releases[0].tender?.status, "active");
  check("截止日已过 → submission_closed，不能信源数据的 active", tender.status, "submission_closed");
  check("公开链接用 idlicitacion，不用 qs", tender.sourceUrl, "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=1211839-44-LE26");
  check("关键日期：发布 / 答疑截止 / 交标", tender.keyDates.map((d) => d.type), ["publication", "questions_deadline", "submission"]);
  check("采购单位是市镇一级（通用 inferGovernmentLevel 会判成 federal）", tender.governmentLevel, "municipal");
}

// ── 5. A real record with NO value — 48% of the feed ──────────────────────
console.log("\n一条真实记录（没有金额的那条 —— 样本里占 48%，不是边角情况）");

const unpriced = readJson("ocds-tender-unpriced.json") as OcdsReleasePackage;
const second = mapChileOcdsPackageToTender(unpriced, undefined, NOW);
if (!second) {
  failures += 1;
  console.log("  ✗ 没金额的那条记录映射出 null");
} else {
  check("没有 tender.value 时不能编一个金额出来", second.estimatedValue, undefined);
  check("也不能编一个币种出来", second.currency, undefined);
  check("其余字段照常", second.tenderNumber, "5839-3-LP26");
  check("采购单位仍然干净", second.buyer.includes(" | "), false);
  check("地区读到了", Boolean(second.location), true);
}

// An amount with no currency really happened (2273-36-LE26, 24,000,000 and no
// currency field). Defaulting it to CLP would be a guess about money.
check(
  "有金额但没币种时，币种留空而不是默认 CLP",
  mapChileOcdsPackageToTender(
    {
      releases: [
        {
          ocid: "ocds-70d2nz-2273-36-LE26",
          id: "x",
          date: "2026-07-01T00:00:00Z",
          parties: [{ roles: ["buyer"], identifier: { legalName: "SERVICIO DE PRUEBA" } }],
          tender: { id: "2273-36-LE26", title: "T", value: { amount: 24000000 } },
        },
      ],
    },
    undefined,
    NOW,
  )?.currency,
  undefined,
);

// ── 6. The field rules, stated as rules ───────────────────────────────────
console.log("\n字段规则（每一条都是从 120 条真实记录里量出来的）");

check(
  "「 | 」两半不一样时，不猜哪半对 —— 优先用 legalName",
  chileBuyerName({
    ocid: "o",
    id: "i",
    parties: [{ roles: ["buyer"], name: "A | B", identifier: { legalName: "NOMBRE LEGAL" } }],
  }),
  "NOMBRE LEGAL",
);
check(
  "没有 legalName 时退到 name 的前半段",
  chileBuyerName({ ocid: "o", id: "i", parties: [{ roles: ["buyer"], name: "A | B" }] }),
  "A",
);
check("地区的尾随空格要去掉", chileRegion({ ocid: "o", id: "i", parties: [{ roles: ["buyer"], address: { region: "Región de Valparaíso " } }] }), "Región de Valparaíso");
check("地区中间的连续空格也归一", chileRegion({ ocid: "o", id: "i", parties: [{ roles: ["buyer"], address: { region: "Región de Tarapacá  " } }] }), "Región de Tarapacá");

check("市镇：ILUSTRE MUNICIPALIDAD", chileGovernmentLevel("ILUSTRE MUNICIPALIDAD DE POZO ALMONTE"), "municipal");
check("市镇：缩写成 MUNIC 的那种", chileGovernmentLevel("CORP MUNIC EDUC SALUD Y ATENCION"), "municipal");
check("大区：SEREMI / … V REGION", chileGovernmentLevel("SERVICIO DE VIVIENDA Y URBANIZACION V REGION"), "state");
check("大区：GOBIERNO REGIONAL", chileGovernmentLevel("GOBIERNO REGIONAL DE ANTOFAGASTA"), "state");
// Chile is a unitary state: ministries, the armed forces, the Servicios de
// Salud and the national services are all central government.
check("中央：部委", chileGovernmentLevel("MINISTERIO DE OBRAS PUBLICAS"), "federal");
check("中央：卫生服务局/医院", chileGovernmentLevel("SERVICIO DE SALUD HOSPITAL DE SANTA CRUZ"), "federal");

check("截止日在将来 → open", chileStatus("2026-12-01T16:00:00Z", NOW), "open");
// Same rule deriveTenderStatus() applies to what the site shows: a tender due
// TODAY is still open. An importer that disagreed would be its own bug.
check("截止日就是今天 → 仍然 open", chileStatus("2026-09-24T16:00:00Z", NOW), "open");
check("截止日已过 → submission_closed", chileStatus("2026-09-23T16:00:00Z", NOW), "submission_closed");
check("没有截止日 → open（不编一个结论出来）", chileStatus(undefined, NOW), "open");

// ── 7. The ficha trap ─────────────────────────────────────────────────────
console.log("\n公开链接的那个陷阱（HTTP 200、121KB、字段全空）");

const trap = read("ficha-qs-plain-code.html");
check("陷阱页确实是 200 抓下来的一整页 HTML", trap.length > 100_000, true);
// This is what makes it a trap: a "did the page come back and does it mention
// the tender" check passes it.
check("陷阱页里确实出现了招标编号（所以「页面里有编号」这种校验会放行它）", trap.includes("1211839-44-LE26"), true);
// And this is why it is useless: the name field is an empty span.
check("但是标题字段是空的 —— 这是一个空壳页", /id="lblNombreLicitacion"[^>]*>\s*</.test(trap), true);
check("我们生成的链接用的是 idlicitacion，不是 qs", chileOcdsPublicUrl("1211839-44-LE26").includes("idlicitacion="), true);
check("生成的链接里不能出现 qs=", chileOcdsPublicUrl("1211839-44-LE26").includes("qs="), false);

// ── 8. A stalled feed must not read as an empty one ───────────────────────
console.log("\n源停更 ≠ 这个窗口没有新项目");

check(
  "所有月份都空时要给出警告",
  describeIndexFreshness([
    { label: "2026-09", empty: true, total: 0 },
    { label: "2026-08", empty: true, total: 0 },
  ])?.includes("2026-07-29"),
  true,
);
check(
  "只要有一个月有数据，就不该报这个警告",
  describeIndexFreshness([
    { label: "2026-08", empty: true, total: 0 },
    { label: "2026-07", empty: false, total: 8004 },
  ]),
  null,
);

if (failures > 0) {
  console.log(`\n${failures} 项没过。`);
  process.exit(1);
}
console.log("\n全部通过。");
