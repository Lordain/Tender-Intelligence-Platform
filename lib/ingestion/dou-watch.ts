import type { IndustryKey } from "@/lib/industry";
import { classifyPortugueseExclusion, classifyPortugueseIndustries, classifyPortugueseSmallWorks } from "@/lib/relevance-pt";
import type { DouNotice } from "@/lib/ingestion/dou-edition";

/**
 * Which DOU notices are worth a person's attention, decided here rather than
 * by in.gov.br's search.
 *
 * ── Why the search is not used, with the measurement ──────────────────────
 *
 * The obvious build is `consulta/-/buscar/dou?q=…`, the way the Mexican DOF
 * connector searches the DOF. Two real searches were captured on 2026-09-19
 * and measured against these rules:
 *
 *   q=concessão          20 rows → **0** worth reading. Nine are ANTT
 *                        `DECISÃO SUROD` rulings on concessions that already
 *                        exist; the top hit is an Instrução Normativa on CSLL
 *                        tax credits. The exact word that names this
 *                        platform's highest-value Brazilian target returns
 *                        none of it.
 *   q=aviso de licitação 20 rows → 4 kept, of which 3 are Petrobras spare
 *                        parts and 1 is a CODEVASF Concorrência the edition
 *                        filter catches anyway.
 *
 * Every row came back `score: 0`, and the highlight markup shows why: the
 * engine matched the WORD, anywhere, including inside the boilerplate every
 * federal notice carries.
 *
 * Precision is therefore no better than reading the edition, and recall is
 * the part that settles it: both captures returned exactly 20 rows, no paging
 * parameter was measured, and one weekday of Seção 3 alone is 2,139 notices.
 * A 20-row answer is a sample of unknown coverage. The edition listing is the
 * whole day by construction, and every notice in it carries the National
 * Press's own `artType` and the full publishing hierarchy — so the whole day
 * is fetched and the targeting happens here, against fields that mean
 * something.
 *
 * ── Three axes, and all three are needed ──────────────────────────────────
 *
 * Measured against the captured sample, each axis alone fails:
 *
 *   STAGE alone — the `Aviso de Licitação` bucket holds road resurfacing in
 *   Guarulhos and dental prostheses in Santa Vitória do Palmar.
 *   ORGAN alone — one day of DNIT, Infraero, Petrobras, Anatel and Correios
 *   is mostly `Extrato de Termo Aditivo`, bottled water and welding rods.
 *   SUBJECT alone — "obras" appears in thousands of municipal notices that
 *   PNCP already carries in full, with a deadline and a value attached.
 *
 * ── The subject vocabulary is borrowed, deliberately ──────────────────────
 *
 * `lib/relevance-pt.ts` already holds this platform's Portuguese exclusion
 * and small-works rules, written against real PNCP rows and tuned by the user
 * over several rounds. A second keyword list here would drift from it within
 * a month, and the two would then disagree about the same tender depending on
 * which door it came through. So the watch calls the same functions.
 */

export type DouStage =
  /** A competition is being opened. The only stage a bidder can still act on from scratch. */
  | "opening"
  /** An open competition changed — reopened, postponed, corrected. Still actionable, and often the first sign a foreign bidder gets more time. */
  | "amendment"
  /** Decided: homologated, awarded, annulled, or handed out without competition. */
  | "closing"
  /** A contract that already exists — extrato, aditivo, ata. */
  | "contract"
  /** Summons, staff competitions, licences, diplomas. Nothing to do with procurement. */
  | "administrative"
  /** The National Press's generic buckets, which carry anything. Resolved by re-reading the title. */
  | "unclear";

/**
 * `artType` → stage.
 *
 * Ordered, and matched as a prefix on the folded string, because the
 * vocabulary is open: 95 distinct values appeared in a 216-row sample, and
 * `Aviso de Licitação-Pregão`, `Aviso de Licitação-Concorrência`,
 * `Aviso de Licitação-Registro de Preços` and `Aviso de Licitação-Leilão` are
 * four of them. An exact-match table would need editing every time the press
 * coins a hyphenated variant, and would fail silently when it did.
 */
const STAGE_PATTERNS: [DouStage, RegExp][] = [
  // Ambiguous buckets first: `Edital`, `Aviso`, `Extrato` and `Comunicado`
  // carry everything, so they must not be caught by the prefixes below.
  // Measured: the `Edital` bucket held both an `AVISO DE LICITAÇÃO PREGÃO
  // ELETRÔNICO SRP` for eye medication and an `AVISO DE CHAMAMENTO PÚBLICO`.
  ["unclear", /^(edital|aviso|extrato|comunicado|ato|ata|retifica[çc][ãa]o|republica[çc][ãa]o)$/i],
  // A direct award and an exemption are notices that competition did NOT
  // happen, which makes them closing, not opening — the same call
  // relevance-pt.ts's header records for PNCP's Dispensa and Inexigibilidade.
  ["closing", /^aviso de (dispensa|inexigibilidade)/i],
  ["closing", /^(resultado|ratifica[çc][ãa]o)/i],
  ["closing", /^aviso de (homologa|adjudica|julgamento|habilita|qualifica|anula|revoga|suspens|rescis|penalidade|cancela)/i],
  ["amendment", /^aviso de (retifica|altera|prorroga|adiamento|reabertura)/i],
  ["opening", /^aviso de licita[çc][ãa]o/i],
  ["opening", /^edital de (leil[ãa]o|credenciamento|chamamento|sele[çc][ãa]o|pr[ée]-?qualifica)/i],
  ["opening", /^aviso de (chamamento|pr[ée]-?qualifica|credenciamento|sele[çc][ãa]o|coleta de pre[çc]os|registro de pre[çc]os|audi[êe]ncia p[úu]blica|consulta p[úu]blica|licita)/i],
  ["administrative", /^(edital de (notifica|cita|intima|convoca|concurso|processo seletivo)|aviso de (registro de diplomas|licen[çc]a|registro de chapas))/i],
  ["contract", /^(extrato|conv[êe]nio|termo)/i],
];

/** The same vocabulary applied to a headline, for the notices whose `artType` is one of the generic buckets. */
function stageFromText(text: string): DouStage {
  for (const [stage, pattern] of STAGE_PATTERNS) {
    if (stage === "unclear") continue;
    if (pattern.test(text.trim())) return stage;
  }
  return "unclear";
}

export function classifyDouStage(notice: Pick<DouNotice, "artType" | "title">): DouStage {
  for (const [stage, pattern] of STAGE_PATTERNS) {
    if (!pattern.test(notice.artType.trim())) continue;
    // A generic artType is not a verdict; the headline usually is.
    return stage === "unclear" ? stageFromText(notice.title) : stage;
  }
  return stageFromText(notice.title);
}

/**
 * What KIND of procurement the notice is, read off the instrument it names.
 *
 * This is the axis PNCP never needed, and the reason the first pass of this
 * watch kept bottled water, a fire damper, a dosing pump and pool chemicals
 * alongside a DNIT design-build highway contract.
 *
 * `lib/relevance-pt.ts` was tuned against PNCP rows, and this platform only
 * ever queries PNCP for *Concorrência* — so the commodity long tail never
 * reached those rules and they were never given a reason to learn it. The DOU
 * has no such filter in front of it: one edition carries every instrument the
 * federal government used that day, Pregão included.
 *
 * The fix is the same one the PNCP query already makes, applied here instead
 * of at a query parameter, and it is a matter of law rather than a heuristic:
 * Lei 14.133/2021 forbids Pregão for obras and reserves it for *bens e
 * serviços comuns*. So the instrument names the category.
 *
 * `disposal` is checked first and separately because a `Leilão` is usually
 * the government SELLING — the sample's Army notice is a scrap auction run by
 * an auctioneer — while a concession auction is the government buying thirty
 * years of investment. Same word, opposite direction of money, and only the
 * object tells them apart.
 */
export type DouProcurementForm =
  /** Works, complex engineering, or a concession/PPP/lease. What this platform exists for. */
  | "works_or_concession"
  /** Ordinary goods and common services — the instrument or the object says so. */
  | "commodity"
  /**
   * Joining a register, not winning a competition: credenciamento,
   * habilitação institucional, a standing chamamento público.
   *
   * Lei 14.133/2021 files credenciamento under *inexigibilidade* — there is
   * no dispute, every qualified applicant is admitted, and the notice stays
   * open indefinitely. It is not an opportunity a bidder can win, so it is
   * not one worth waking someone up for. Measured: four of the 37 rows the
   * first full-edition run kept were these — three Operação Carro-Pipa
   * water-truck registers and one AGU call for research foundations.
   */
  | "registration"
  /** The state selling something: surplus, scrap, seized goods. */
  | "disposal"
  /** Neither the instrument nor the object was named in the 403 characters that survived truncation. */
  | "unknown";

const FORM_DISPOSAL = /\b(leil[ãa]o|leiloeir[ao])\b[\s\S]{0,200}?\b(aliena|venda|vender|desfazimento|sucata|inserv[íi]ve|bens? m[óo]veis|semoventes|apreendid)/i;
const FORM_WORKS =
  /\b(concorr[êe]ncia|di[áa]logo competitivo|regime diferenciado de contrata|\bRDC\b|contrata[çc][ãa]o (integrada|semi-?integrada)|chamamento p[úu]blico|pr[ée]-?qualifica[çc][ãa]o|manifesta[çc][ãa]o de interesse|\bPMI\b|\bPPP\b|parceria p[úu]blico-?privada|concess[ãa]o (comum|patrocinada|administrativa|de servi|florestal|real de uso)|arrendamento|permiss[ãa]o de servi[çc]o)\b/i;
const FORM_COMMODITY = /\b(preg[ãa]o|tomada de pre[çc]os|convite|cota[çc][ãa]o eletr[ôo]nica|dispensa (eletr[ôo]nica|de licita)|inexigibilidade)\b/i;
const FORM_REGISTRATION = /\b(credenciamento|habilita[çc][ãa]o institucional|chamamento p[úu]blico permanente|pr[ée]-?cadastramento)\b/i;

/**
 * The object is a purchase of goods or of an ordinary service.
 *
 * Needed because Petrobras — which files more DOU notices than anyone — names
 * no instrument at all. Its notices read `AVISO DE LICITAÇÃO Nº 70046xxxxx
 * Objeto: Aquisição de <part>`, and 27 of the 37 rows the first full-edition
 * run kept were exactly that: a fire damper, a welding rod, a mechanical
 * seal, a relay, a concrete post, a 75kVA transformer.
 */
const OBJECT_IS_A_PURCHASE = /\b(aquisi[çc][ãa]o|servi[çc]os? de|fornecimento de)\b/i;

/**
 * The object is work done ON infrastructure.
 *
 * Deliberately all ACTIONS and no PLACES. `porto`, `terminal` and `aeroporto`
 * were in an earlier draft and had to come out: Transpetro's "Serviços de
 * ensaios físico químicos … para o Terminal de Cabiunas" is a laboratory
 * contract that mentions a terminal, and a place name in a 403-character stub
 * says where the work happens, never what it is. Every real works notice in
 * the measured edition carries one of these verbs anyway — DNIT's two both
 * say `obras`, the Navy's two say `Obra` and `obra de engenharia civil`.
 */
const OBJECT_IS_WORKS =
  /\b(obras?|engenharia|constru[çc][ãa]o|duplica[çc][ãa]o|pavimenta|restaura[çc][ãa]o|reforma|amplia[çc][ãa]o|recupera[çc][ãa]o|readequa[çc][ãa]o|implanta[çc][ãa]o|terraplen|dragagem|derroca|saneamento)\b/i;

export function classifyDouForm(text: string): DouProcurementForm {
  if (FORM_DISPOSAL.test(text)) return "disposal";
  // Before works, because these notices say "chamamento público" too and that
  // phrase is otherwise a works signal. A register is not a competition.
  if (FORM_REGISTRATION.test(text)) return "registration";
  // Works before commodity, on purpose: a notice reading "Concorrência
  // Eletrônica … em substituição ao Pregão" must land on the instrument
  // actually being used, and that is the one named first in these notices.
  if (FORM_WORKS.test(text)) return "works_or_concession";
  if (FORM_COMMODITY.test(text)) return "commodity";
  // No instrument named. Fall back to the object, which is the only other
  // thing the stub reliably carries — and for the single biggest filer in the
  // gazette it is the ONLY thing. A purchase with no works verb anywhere is a
  // purchase; `unknown` is kept for a stub that says neither.
  if (OBJECT_IS_WORKS.test(text)) return "works_or_concession";
  if (OBJECT_IS_A_PURCHASE.test(text)) return "commodity";
  return "unknown";
}

/**
 * Publishing bodies whose DOU notices are never worth reading, whatever they
 * say.
 *
 * `Prefeituras` is the big one — 64 of a 216-row sample that was deliberately
 * flattened to two rows per organ, so its real share of the 2,139 is far
 * larger. It is excluded not because municipal work does not matter but
 * because PNCP already carries it IN FULL, with a deadline and a value
 * attached, and a DOU notice is a 403-character stub. Watching it here would
 * duplicate a better source with a worse copy.
 *
 * `Ineditoriais` are paid private announcements. The rest are courts,
 * prosecutors, auditors and professional councils: real bodies, no
 * infrastructure.
 */
export const DOU_NEVER_WATCHED_ORGANS: readonly string[] = [
  "Prefeituras",
  "Ineditoriais",
  "Poder Judiciário",
  "Ministério Público da União",
  "Tribunal de Contas da União",
  "Defensoria Pública da União",
  "Entidades de Fiscalização do Exercício das Profissões Liberais",
];

/**
 * The default watchlist: the federal portfolios that build things.
 *
 * Matched as a prefix of the top-level organ, because the payload spells the
 * ministry out in full and the agencies hang below it — DNIT and ANTT under
 * Transportes, ANTAQ, ANAC, Infraero and the Companhias Docas under Portos e
 * Aeroportos, ANEEL, Petrobras and Eletrobras under Minas e Energia, CBTU and
 * Trensurb under Cidades. Naming the ministry therefore catches every agency
 * under it without a list that goes stale when one is renamed.
 *
 * Defence is in deliberately: the Army's engineering command runs real
 * highway and dam work. The subject axis is what removes its barracks
 * catering, not the organ axis.
 */
export const DOU_WATCHED_ORGANS: readonly string[] = [
  "Ministério dos Transportes",
  "Ministério de Portos e Aeroportos",
  "Ministério de Minas e Energia",
  "Ministério das Cidades",
  "Ministério da Integração e do Desenvolvimento Regional",
  "Ministério das Comunicações",
  "Ministério do Meio Ambiente e Mudança do Clima",
  "Ministério da Defesa",
  "Presidência da República",
];

function matchesOrgan(notice: DouNotice, watchlist: readonly string[]): boolean {
  const top = notice.organs[0] ?? "";
  return watchlist.some((organ) => top.toLowerCase().startsWith(organ.toLowerCase()));
}

export type DouWatchOptions = {
  /** Which top-level organs to keep. Empty means every organ that is not on the never-watched list. */
  organs?: readonly string[];
  /** Stages worth reporting. Defaults to the two a bidder can still act on. */
  stages?: readonly DouStage[];
  /** Keep municipal notices, which PNCP already carries in full. Off by default. */
  includePrefeituras?: boolean;
  /** An extra term the title or the snippet must contain, folded and case-insensitive. */
  keyword?: string;
  /** Which procurement forms to keep. Defaults to works/concessions plus the ones that named no instrument. */
  forms?: readonly DouProcurementForm[];
};

export type DouVerdict = {
  notice: DouNotice;
  stage: DouStage;
  form: DouProcurementForm;
  industries: IndustryKey[];
  keep: boolean;
  /** Why it was kept, or which gate dropped it. Always set — a verdict with no reason is one nobody can check. */
  why: string;
};

const DEFAULT_STAGES: readonly DouStage[] = ["opening", "amendment"];
/**
 * `unknown` is kept by default and `commodity` is not.
 *
 * The truncation is why. 403 characters routinely end before the instrument
 * is named, so "no instrument found" carries no evidence either way — and the
 * failure directions are not symmetric: a commodity notice that slips through
 * costs one line of a report, while a dropped concession is a project this
 * platform never hears about. `lib/relevance-pt.ts` makes the same call in
 * its own words: under-exclusion is the cheaper mistake.
 */
const DEFAULT_FORMS: readonly DouProcurementForm[] = ["works_or_concession", "unknown"];

export function judgeDouNotice(notice: DouNotice, options: DouWatchOptions = {}): DouVerdict {
  const stage = classifyDouStage(notice);
  // Title AND snippet: the headline is often just "AVISO DE LICITAÇÃO", and
  // everything that says what is being bought is in the stub below it.
  const text = `${notice.title} ${notice.snippet}`;
  const form = classifyDouForm(text);
  const industries = classifyPortugueseIndustries(text);
  const verdict = (keep: boolean, why: string): DouVerdict => ({ notice, stage, form, industries, keep, why });

  const top = notice.organs[0] ?? "（未署名）";
  if (!options.includePrefeituras && DOU_NEVER_WATCHED_ORGANS.some((o) => top.toLowerCase().startsWith(o.toLowerCase()))) {
    return verdict(false, `机构：${top} —— 不在监控范围（市政公告 PNCP 已经全量收了，这里只有 403 字的摘要）`);
  }

  const organs = options.organs ?? DOU_WATCHED_ORGANS;
  if (organs.length > 0 && !matchesOrgan(notice, organs)) {
    return verdict(false, `机构：${top} —— 不在这次的监控清单里`);
  }

  const stages = options.stages ?? DEFAULT_STAGES;
  if (!stages.includes(stage)) {
    return verdict(false, `阶段：${stage} —— 只看 ${stages.join(" / ")}`);
  }

  const forms = options.forms ?? DEFAULT_FORMS;
  if (!forms.includes(form)) {
    return verdict(false, `采购方式：${form} —— 只看 ${forms.join(" / ")}`);
  }

  if (options.keyword !== undefined && options.keyword !== "") {
    if (!text.toLowerCase().includes(options.keyword.toLowerCase())) {
      return verdict(false, `不含关键词「${options.keyword}」`);
    }
  }

  // The same rules the Brazilian importer applies, called rather than
  // re-implemented — see the header.
  const excluded = classifyPortugueseExclusion(text);
  if (excluded !== null) return verdict(false, `内容：${excluded} —— 与巴西导入用的是同一套排除规则`);
  const small = classifyPortugueseSmallWorks(text);
  if (small !== null) return verdict(false, `内容：${small} —— 与巴西导入用的是同一套小型工程规则`);

  return verdict(true, `${top} · ${stage} · ${form}${industries.length > 0 ? ` · ${industries.join("/")}` : ""}`);
}

export type DouWatchReport = {
  kept: DouVerdict[];
  dropped: DouVerdict[];
  /** How many notices each drop reason accounted for, so a filter that is too tight shows up as a number. */
  droppedBy: { reason: string; count: number }[];
};

export function watchDouEdition(notices: readonly DouNotice[], options: DouWatchOptions = {}): DouWatchReport {
  const kept: DouVerdict[] = [];
  const dropped: DouVerdict[] = [];
  const counts = new Map<string, number>();
  for (const notice of notices) {
    const verdict = judgeDouNotice(notice, options);
    if (verdict.keep) {
      kept.push(verdict);
      continue;
    }
    dropped.push(verdict);
    // Bucketed by the gate, not by the whole sentence: the organ name varies
    // per row and would give one bucket per notice, which counts nothing.
    const bucket = verdict.why.split("——")[0].trim();
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return {
    kept,
    dropped,
    droppedBy: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
