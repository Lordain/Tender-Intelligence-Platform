import { foldAccents } from "@/lib/text-fold";
import type { IndustryKey } from "@/lib/industry";

/**
 * Portuguese exclusion rules — Brazil only.
 *
 * ── Why this is a separate file, reversing an earlier recommendation ──────
 *
 * The plan of record (lib/ingestion/README.md, and my own recommendation
 * earlier in this work) was to add Portuguese branches into the existing
 * Spanish patterns in lib/relevance.ts: 238 occurrences of the `ci[óo]n` word
 * form across 160 pattern lines, each gaining a `ç[ãa]o` alternative. Seeing
 * the real data changed the calculation, so this reverses it:
 *
 *  1. **Those 160 lines are live.** Mexico, Colombia and Peru run through
 *     them in production right now. Editing every one of them to serve a
 *     country that has not imported a single row yet puts three working
 *     feeds at risk for the benefit of a fourth that does not exist. One
 *     mistyped alternation inside a 200-character regex is not something
 *     review reliably catches.
 *  2. **A country gate makes the risk exactly zero.** Everything here runs
 *     only when `country === "Brazil"`. It cannot change a Mexican,
 *     Colombian or Peruvian verdict by construction, not by care.
 *  3. **The list needed is far smaller than the Spanish one.** Querying only
 *     Concorrência Eletrônica/Presencial already removes what the Spanish
 *     list mostly defends against: Dispensa and Inexigibilidade — direct
 *     awards, 61% of PNCP's index — carry the micro-purchase long tail
 *     (a pink highlighter, vehicle parts by licence plate, artistic
 *     performances), and none of it is queried. In 100 consecutive
 *     Concorrência rows, every title was a real public work. The rules below
 *     exist for the handful that are not.
 *
 * ── The direction of error that matters ──────────────────────────────────
 *
 * The README measured Spanish rules against Portuguese text and found they
 * agreed 6/10, with every failure in the dangerous direction: office
 * cleaning, a pickup truck and school meals each excluded in Spanish and
 * landing on 中型项目 in Portuguese, because `limpieza` does not match
 * `limpeza` and `recolección` does not match `coleta`. So under-exclusion is
 * the failure this file is for.
 *
 * It stays narrow anyway. An excluded tender is never written to Supabase, so
 * a rule broader than its own name loses real work permanently and silently —
 * and for this platform a lost R$50M highway costs far more than a routine
 * services contract that has to be deleted by hand. Every pattern below is a
 * phrase, not a bare word, and every one of them was written against a title
 * actually seen in the 2026-09-18 corpus unless its comment says otherwise.
 */

/**
 * Routine services and goods, in Portuguese.
 *
 * The Spanish equivalents live in EXCLUDE_KEYWORDS in lib/relevance.ts; these
 * are deliberately NOT translations of that whole list, only the categories
 * that can realistically appear in a Concorrência.
 */
export const PT_EXCLUDE_KEYWORDS: RegExp[] = [
  // Real, corpus 2026-09-18: "PRESTAÇÃO DOS SERVIÇOS DE COLETA, TRANSPORTE E
  // DESTINAÇÃO DE RESÍDUOS SÓLIDOS DOMICILIARES" (Diadema/SP) and
  // "RECOLHIMENTO DE RESIDUOS SOLIDOS NO MUNICIPIO DE JAGUARE/ES".
  // Anchored on the waste word plus a handling verb so that a landfill or a
  // treatment plant — real infrastructure this platform wants — is not caught
  // by the word "resíduos" alone.
  /\b(coleta|recolhimento|remo[çc][ãa]o|transporte|destina[çc][ãa]o|disposi[çc][ãa]o)\b[^.]{0,60}\bres[íi]duos?\s+s[óo]lidos?\b/i,
  // Real: "SERVIÇO DE LIMPEZA URBANA E SANEAMENTO AMBIENTAL" (Novo Hamburgo/RS)
  // and "SERVIÇOS DE LIMPEZA, CONSERVAÇÃO E HIGIENIZAÇÃO COM DEDICAÇÃO
  // EXCLUSIVA DE MÃO DE OBRA". Note `limpeza urbana` is street cleaning, a
  // routine municipal service — not to be confused with `saneamento básico`
  // works (sewerage/water infrastructure), which is kept and is why this
  // pattern requires the limpeza word rather than matching `saneamento`.
  /\bservi[çc]os?\s+de\s+limpeza\b|\blimpeza\s+urbana\b|\blimpeza,\s*conserva[çc][ãa]o\b|\bhigieniza[çc][ãa]o\b/i,
  // Real: "cessão onerosa do direito à prestação dos serviços de
  // processamento e pagamento da folha de pagamento do Município"
  // (Maximiliano de Almeida/RS) — a banking concession auctioned as a
  // Concorrência. Nothing is built or supplied.
  /\bfolha\s+de\s+pagamento\b/i,
  // Not in the Concorrência corpus, but sitting one modality away and
  // unambiguous: catering, security guarding, groundskeeping.
  /\bservi[çc]os?\s+de\s+(vigil[âa]ncia|seguran[çc]a\s+patrimonial|portaria)\b/i,
  /\bfornecimento\s+de\s+(refei[çc][õo]es|alimenta[çc][ãa]o)\b|\bmerenda\s+escolar\b/i,
  /\bservi[çc]os?\s+de\s+jardinagem\b|\bpoda\s+de\s+[áa]rvores\b/i,
  /\bmaterial\s+de\s+expediente\b|\bmaterial\s+de\s+copa\s+e\s+cozinha\b/i,
  /\bapresenta[çc][õo]?[ãa]?o?\s+art[íi]stica\b|\bcredenciamento\s+de\s+artistas\b|\bgrupo\s+teatral\b/i,
  // Real: "Contratação de inscrição para a participação da Chefe de Gabinete
  // no 4° Congresso Brasileiro de Mulheres de RPPS". The registration word and
  // the event word are eleven words apart, so a rigid adjacency misses it.
  // The alternation is INSIDE the word, not around the whole pattern. Written
  // the other way round — `\binscri[çc][ãa]o|\binscri[çc][õo]es\b...` — the
  // first branch is a bare "inscrição" with no event requirement at all, which
  // would swallow "inscrição imobiliária" (a property registration) and every
  // other unrelated use. An exclude rule that broad loses real tenders
  // permanently, which is the one direction this file must not fail in.
  /\binscri[çc](?:[ãa]o|[õo]es)\b[^.]{0,80}\b(curso|congresso|semin[áa]rio|capacita[çc][ãa]o|treinamento)\b/i,
  /\bloca[çc][ãa]o\s+de\s+ve[íi]culos?\b|\bpe[çc]as\s+para\s+o\s+ve[íi]culo\b/i,
  /\bfornecimento\s+de\s+combust[íi]ve(l|is)\b/i,
  /\baquisi[çc][ãa]o\s+de\s+medicamentos\b/i,
  // The four below come from the FIRST real Brazil write (2026-09-18, 20 rows
  // kept, 17 written), reviewed row by row by the user, who marked all four
  // 排除. They are the categories a US$2,000,000 floor does not catch: federal
  // and state-owned buyers sign service contracts far above it, so scale says
  // nothing about whether a Chinese contractor could bid.
  //
  // Real: EMBRATUR 35842428000166-1-000008/2026, "serviços de Comunicação
  // Corporativa e Relações Públicas em Território Nacional". Communications,
  // PR and advertising. `publicidade` also earned its place from two rows in
  // the 2026-09-18 dry run the user reviewed and excluded by hand.
  /\bcomunica[çc][ãa]o\s+(corporativa|institucional)\b|\brela[çc][õo]es\s+p[úu]blicas\b|\bassessoria\s+de\s+imprensa\b|\bpublicidade\b|\bpropaganda\s+(institucional|legal)\b/i,
  // Real: CAIXA 00360305000104-1-000741/2026, "SERVIÇOS COMUNS DE TRANSPORTE,
  // TRATAMENTO E CUSTÓDIA DE VALORES PARA UNIDADES CAIXA". Cash in transit.
  // The gap is not laziness: the real title puts three verbs between the one
  // that identifies the service and "DE VALORES". Anchoring on `valores`
  // alone would be wrong — it is also the ordinary word for "amounts", which
  // appears throughout price-adjustment prose.
  /\b(transporte|cust[óo]dia)\b[^.]{0,40}\bde\s+valores\b/i,
  // Real: CAIXA 00360305000104-1-000742/2026, "DISPONIBILIZAÇÃO, LOCAÇÃO E
  // OPERAÇÃO DE UNIDADES DE ATENDIMENTO CONCEBIDAS EM SOLUÇÃO CONSTRUTIVA
  // TIPO OFF SITE COMPOSTAS POR MÓDULOS". Prefabricated branches, rented and
  // run — the modules stay the lessor's, so nothing is built for the buyer.
  // Requires an operating verb beside `locação` rather than matching it
  // alone, which would also take the plant and equipment hire that belongs
  // inside a genuine works package.
  /\bloca[çc][ãa]o\b[^.]{0,40}\b(opera[çc][ãa]o|disponibiliza[çc][ãa]o)\b|\b(opera[çc][ãa]o|disponibiliza[çc][ãa]o)\b[^.]{0,40}\bloca[çc][ãa]o\b/i,
  // Real: Gravataí/RS 87890992000158-1-001012/2026, "Contratação de entidade
  // para a gestão das Unidades de Pronto Atendimento" — an organização social
  // takes over running the emergency units. Running a health facility is the
  // opposite of building one. `gestão` is only excluding when what it manages
  // is the service itself, hence the required facility word.
  /\b(gest[ãa]o|gerenciamento)\b[^.]{0,40}\b(unidade(s)?\s+de\s+pronto\s+atendimento|upas?|unidade(s)?\s+b[áa]sica(s)?\s+de\s+sa[úu]de|servi[çc]os?\s+de\s+sa[úu]de|hospital(ar)?)\b/i,
];

/**
 * Contracts that only keep an existing asset running.
 *
 * Mirrors MAINTENANCE_ONLY_KEYWORDS in lib/relevance.ts, which is
 * non-bypassable there for the same reason it is here: maintaining a road is
 * not building one, and the difference is the entire product.
 *
 * `manutenção` alone is not enough and is deliberately not used. Real titles
 * pair it with construction — "manutenção e melhoria de quadras, areninhas e
 * arenas públicas" (Crato/CE) is a real works contract. So each pattern below
 * requires the maintenance word to be the WHOLE object, not one verb in a
 * list that also contains building verbs.
 */
export const PT_MAINTENANCE_ONLY_KEYWORDS: RegExp[] = [
  /\bmanuten[çc][ãa]o\s+(preventiva|corretiva)\b/i,
  /\bmanuten[çc][ãa]o\s+de\s+ve[íi]culos?\b|\bmanuten[çc][ãa]o\s+da\s+frota\b/i,
  // "CONSERVAÇÃO DO BENS IMÓVEIS" — the real title says DO, not DE. Brazilian
  // procurement prose is not consistently grammatical and a pattern that
  // assumes it is will miss the row it was written for.
  /\bconserva[çc][ãa]o\s+d[eo]s?\s+bens\s+im[óo]veis\b/i,
];

/**
 * Repainting a building.
 *
 * Real, reviewed 2026-09-18: "Registro de Preços para serviços comuns de
 * engenharia destinados à execução de serviços de pintura predial interna e
 * externa." A local decorating contract.
 *
 * It was already excluded, but by accident rather than by rule — the
 * no-industry-AND-no-amount gate caught it, and this is a registro de preços:
 * the day one publishes a ceiling value the row walks straight in.
 *
 * Checked before the works guard like the two rules above, and for a third
 * variant of the same trap. Here the word that spares it is `engenharia`:
 * "serviços comuns de engenharia" is Lei 14.133's own category name for minor
 * engineering services, so it appears on the most trivial contracts there are
 * and is not evidence that anything is being built. (PT_REAL_WORKS_SIGNAL's
 * bare `\bengenharia\b` is weak for exactly that reason — narrowing it would
 * change which rows every other exclude rule can reach, so it is left alone
 * and noted here rather than adjusted blind.)
 *
 * `predial`, or the interna/externa pair, is required — road marking
 * (`pintura de sinalização horizontal`) is a real highway work item and is
 * untouched.
 */
const PT_BUILDING_PAINTING =
  /\bpintura\s+predial\b|\bpintura\s+(interna\s+e\s+externa|externa\s+e\s+interna)\b/i;

/**
 * Managing, supervising or inspecting somebody else's works.
 *
 * Two real rows, reviewed by the user 2026-09-18:
 *   - SEINFRA/AL: "elaboração de estudos e projetos, gerenciamento,
 *     supervisão e apoio à fiscalização de obras de responsabilidade da
 *     Secretaria de Estado da Infraestrutura";
 *   - AGETO/TO: "serviços técnicos de gerenciamento e assessoria técnica,
 *     para projetos e obras rodoviárias na malha rodoviária do estado".
 *
 * Both are the consultant sitting BESIDE the contract, not the contractor.
 * Brazilian states tender these separately from the works themselves, and
 * they need a local engineering firm with CREA-registered staff on site.
 *
 * Neither reached the consulting rules at all. `inferScopeType` reads the
 * word `obras` and calls them works (verified: both come back scopeType
 * "works"), and the Portuguese works guard reads the same word and spares
 * them — the same trap PT_OPERATION_AND_MAINTENANCE exists for, and for the
 * same reason: `obras` here is what is being SUPERVISED, not what is being
 * built. So this is checked ahead of that guard too, vetoed by a build verb.
 *
 * Deliberately not anchored on "elaboração de projetos", which is pure design
 * consultancy that inferScopeType already classifies as consulting on its own
 * — adding it here would widen this rule to cover something already handled.
 */
const PT_WORKS_SUPERVISION =
  /\bgerenciamento\b|\bsupervis[ãa]o\b|\bfiscaliza[çc][ãa]o\b|\bassessoria\s+t[ée]cnica\b|\bgerenciadora\b/i;

/**
 * An O&M contract: running and maintaining something that already exists.
 *
 * Real row, reviewed by the user 2026-09-18 (维护类): "CONTRATAÇÃO DE EMPRESA
 * ESPECIALIZADA PARA PRESTAÇÃO DE SERVIÇOS CONTINUADOS DE OPERAÇÃO E
 * MANUTENÇÃO DOS SISTEMAS E OBRAS DO PROJETO RENASCE SALGADINHO."
 *
 * It is checked BEFORE PT_REAL_WORKS_SIGNAL, which is the whole point of it
 * existing separately. That guard fires on a bare `\bobras?\b`, and this
 * title carries one — but as the OBJECT being maintained ("manutenção DOS
 * sistemas e OBRAS do projeto"), not as work being built. The guard read the
 * word and spared the row, so an O&M contract on finished infrastructure came
 * out 常规项目.
 *
 * This mirrors the doctrine the Spanish side already settled on (see
 * MAINTENANCE_ONLY_KEYWORDS and its concession note in lib/relevance.ts):
 * "operación y mantenimiento" without a build scope is upkeep, and upkeep
 * needs a local service presence and a spare-parts stock — not an opportunity
 * a Chinese contractor can take from abroad.
 *
 * The veto is a build VERB, not the noun `obras`, which is exactly the
 * distinction the works guard cannot make. "CONSTRUÇÃO, OPERAÇÃO E
 * MANUTENÇÃO DE ..." is a DBO concession — the largest thing Brazil tenders,
 * and squarely what this platform is for — so a construction verb anywhere in
 * the title takes the row back out of this rule.
 */
const PT_OPERATION_AND_MAINTENANCE =
  /\bopera[çc][ãa]o\s+e\s+manuten[çc][ãa]o\b|\bmanuten[çc][ãa]o\s+e\s+opera[çc][ãa]o\b/i;

/** Building verbs only — never the bare noun `obras`, which an O&M title carries as its object. */
const PT_BUILD_VERB =
  /constru[çc][ãa]o|implanta[çc][ãa]o|amplia[çc][ãa]o|\breforma\b|pavimenta[çc][ãa]o|recapeamento|terraplanagem|requalifica[çc][ãa]o|urbaniza[çc][ãa]o|execu[çc][ãa]o\s+d[aeo]s?\s+obras?\b|\bconcess[ãa]o\b/i;

/**
 * Words that mean a real public work is being built, supplied or designed.
 *
 * Used as a guard, not a promoter: a title carrying one of these is NOT
 * excluded by the lists above. Real corpus case this exists for —
 * "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA OS SERVIÇOS DE ENGENHARIA DE
 * MANUTENÇÃO E MELHORIA DE QUADRAS, ARENINHAS E ARENAS PÚBLICAS" (Crato/CE):
 * the maintenance list would take it, and it is a works contract.
 *
 * This is the "narrower than its own name" discipline the Spanish rules use,
 * expressed once instead of inside every pattern.
 */
const PT_REAL_WORKS_SIGNAL =
  // `(?<!m[ãa]o\s+de\s+)` is the whole reason this is not a bare \bobras?\b.
  // "MÃO DE OBRA" is Portuguese for labour/workforce, it appears in a large
  // share of service contracts ("LIMPEZA ... COM DEDICAÇÃO EXCLUSIVA DE MÃO
  // DE OBRA" is a real 2026-09-18 title), and without this the guard read
  // every one of them as a public work and refused to exclude any of them.
  // Caught by the corpus test, not by review.
  /(?<!m[ãa]o\s+de\s+)\bobras?\b|constru[çc][ãa]o|pavimenta[çc][ãa]o|capeamento|recapeamento|terraplanagem|drenagem|amplia[çc][ãa]o|implanta[çc][ãa]o|requalifica[çc][ãa]o|urbaniza[çc][ãa]o|\bengenharia\b|\bponte(s)?\b|\bbueiro(s)?\b|\bviaduto(s)?\b|\brodovia\b|\bsaneamento\s+b[áa]sico\b|\besta[çc][ãa]o\s+de\s+tratamento\b/i;

/** Brazil only. Everything in this module is gated on it, so no other country's verdict can change. */
export function isBrazil(country: string | undefined): boolean {
  return country === "Brazil";
}

export type PortugueseExclusion = "keyword" | "maintenance_only" | "consulting";

/**
 * Whether a Brazilian tender is routine enough to keep out of the feed.
 *
 * Returns null for anything carrying a real works signal, so the guard is
 * applied in one place rather than negated inside a dozen patterns.
 */
export function classifyPortugueseExclusion(input: string): PortugueseExclusion | null {
  // Folded — see lib/text-fold.ts. Portuguese is the language where the
  // ASCII-only \b bites hardest: every -ário/-ório word looked like a word
  // boundary to it.
  const text = foldAccents(input);
  // Before the works guard on purpose — see PT_OPERATION_AND_MAINTENANCE.
  if (PT_OPERATION_AND_MAINTENANCE.test(text) && !PT_BUILD_VERB.test(text)) return "maintenance_only";
  // Same placement, same reason — see PT_WORKS_SUPERVISION.
  if (PT_WORKS_SUPERVISION.test(text) && !PT_BUILD_VERB.test(text)) return "consulting";
  if (PT_BUILDING_PAINTING.test(text) && !PT_BUILD_VERB.test(text)) return "keyword";
  if (PT_REAL_WORKS_SIGNAL.test(text)) return null;
  if (PT_MAINTENANCE_ONLY_KEYWORDS.some((pattern) => pattern.test(text))) return "maintenance_only";
  if (PT_EXCLUDE_KEYWORDS.some((pattern) => pattern.test(text))) return "keyword";
  return null;
}

/**
 * Industry tags from Portuguese text.
 *
 * Separate from lib/industry.ts's Spanish patterns for the same structural
 * reason the exclusions are: those patterns are live for three countries, and
 * a Portuguese alternative bolted into a 400-character regex can only break
 * them. Merged into the Spanish result rather than replacing it — a title can
 * legitimately match both (proper nouns, "SCADA", "km 42+300"), and dropping
 * the Spanish pass would lose those.
 *
 * Tag keys must stay in step with lib/industry.ts's IndustryKey union; the
 * public filter chips are built from that list, and a tag not in it would
 * render as an untranslated string.
 *
 * Deliberately narrower than the Spanish set. Only the categories that
 * actually appear in Brazilian Concorrência are here, each written from the
 * 2026-09-18 corpus. Adding "healthcare" for a UBS (basic health unit) would
 * be wrong, for instance: lib/relevance.ts excludes medical services, and
 * building a clinic is construction — which is how the corpus's many UBS and
 * ESF contracts should read.
 */
const PT_INDUSTRY_PATTERNS: [IndustryKey, RegExp][] = [
  // Roads are the single largest category in the corpus. `rodovia`, `via
  // pública`, `paralelepípedo` and `bloquete` (both paving stone types) have
  // no Spanish equivalents in lib/industry.ts, so without these a Brazilian
  // road contract carries no transport tag at all.
  ["transportation", /\brodovias?\b|\brodovi[áa]ri[oa]\b|pavimenta[çc][ãa]o|capeamento\s+asf[áa]ltico|asf[áa]ltic[oa]|\bvias?\s+p[úu]blicas?\b|paralelep[íi]pedo(s)?|\bbloquete(s)?\b|sinaliza[çc][ãa]o\s+vi[áa]ria|terminal\s+rodovi[áa]rio|\bponte(s)?\b|\bviaduto(s)?\b|transporte\s+(p[úu]blico|aquavi[áa]rio)|\bestradas?\s+(rurais|vicinais)\b/i],
  // `pavimenta[çc][ãa]o` is here as well as under transportation on purpose:
  // lib/industry.ts's Spanish `construction` pattern likewise carries
  // `pavimentaci[óo]n`, and a road contract genuinely is both. Without it the
  // real title "execução da obra de implantação e pavimentação da Rodovia
  // MT-403" carried a transport tag and no construction tag — caught by the
  // corpus test.
  // `(?<!m[ãa]o\s+de\s+)\bobras?\b` replaced a narrower
  // `obras? de (engenharia|implantação|ampliação|reforma)`, which a real
  // excluded row walked straight past: "execução de obras, referente à
  // ampliação da Escola Coronel Francisco Ferreira de Carvalho" — a school
  // extension, judged a keeper by the user (2026-09-18), tagged with nothing
  // because a comma sits where the narrow pattern wanted "de". `obra` on its
  // own IS the Portuguese word for a public work, so the right pattern is the
  // bare one carrying the same MÃO DE OBRA guard PT_REAL_WORKS_SIGNAL already
  // proved it needs — not a longer list of the phrasings seen so far.
  ["construction", /(?<!m[ãa]o\s+de\s+)\bobras?\b|constru[çc][ãa]o|edifica[çc][õo]es|pavimenta[çc][ãa]o|recapeamento|reforma\s+e\s+amplia[çc][ãa]o|requalifica[çc][ãa]o|urbaniza[çc][ãa]o|terraplanagem|empreitada|\bengenharia\s+civil\b/i],
  // `esgoto` (sewerage), `drenagem pluvial` (storm drainage) and `bueiro`
  // (culvert) are the words a Brazilian title uses; none of them appear in
  // the Spanish water pattern.
  ["water", /\besgotos?\b|saneamento\s+b[áa]sico|drenagem(\s+pluvial)?|\b[áa]gua\s+(pot[áa]vel|para\s+consumo\s+humano)\b|esta[çc][ãa]o\s+de\s+tratamento|\bbueiro(s)?\b|\bre?servat[óo]rios?\b|barragem|\bdragagem\b/i],
  ["power", /energia\s+el[ée]trica|rede\s+de\s+distribui[çc][ãa]o\s+de\s+energia|subesta[çc][ãa]o|ilumina[çc][ãa]o\s+p[úu]blica|projetos?\s+el[ée]tricos?|luminot[ée]cnic[oa]/i],
  ["ict_telecom", /fibra\s+[óo]ptica|conex[ãa]o\s+dedicada\s+[àa]\s+internet|videomonitoramento|\bdatacenter\b|intelig[êe]ncia\s+urbana/i],
];

/** Portuguese-only industry tags. Returns [] rather than ["general"] — the caller merges this with the Spanish pass, which already supplies that fallback. */
export function classifyPortugueseIndustries(input: string): IndustryKey[] {
  const text = foldAccents(input);
  return PT_INDUSTRY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
}

/**
 * Small open-air municipal sport and recreation facilities.
 *
 * The same shape as MUNICIPAL_WATER_COMPONENT_KEYWORDS in lib/relevance.ts: a
 * category a Brazilian municipality buys constantly, builds with a local
 * contractor, and that carries the word `construção` — so once the industry
 * gate learned Portuguese, these arrive tagged `construction` and read like
 * building work.
 *
 * Fitted on ONE row, which is thin and worth saying plainly:
 *   "CONSTRUÇÃO DE CAMPO DE FUTEBOL COM GRAMA SINTÉTICA, MEIA QUADRA DE
 *    BASQUETE, PARQUINHO INFANTIL E PISTA DE CAMINHADA (TIPO B)"
 * excluded by the user, 2026-09-18, in the same pass that rescued two others.
 *
 * PT_BUILDING_SCOPE is the veto, and the reason this is not just a word list.
 * The row the user KEPT in that same review is also a sports project —
 * "Construção de Complexo Poliesportivo … Ginásio Esportivo … Piscina
 * Desportiva … Nova Sede da Secretaria" — so "mentions sport" cannot be the
 * test. A pitch, a playground and a walking track are surfaces; a ginásio, a
 * piscina and a sede are buildings, and the buildings are the work worth
 * flying for.
 *
 * `parquinho` is matched, `parque` deliberately is not: the kept row contains
 * "Parque Municipal" and the excluded one "PARQUINHO INFANTIL". The
 * diminutive is the whole difference between a municipal park and a
 * children's playground.
 */
const PT_MUNICIPAL_SPORTS_COMPONENT =
  /\bcampo\s+de\s+futebol\b|\bgrama\s+sint[ée]tica\b|\bparquinho\b|\bpista\s+de\s+caminhada\b|\bacademia\s+ao\s+ar\s+livre\b|\bareninha(s)?\b/i;

const PT_BUILDING_SCOPE =
  /\bgin[áa]sio\b|\bpiscina\b|\bcomplexo\b|\bedif[íi]cio(s)?\b|\bedifica[çc][õo]es\b|\bsede\b|\bescola\b|\bcreche\b|\bhospital\b|\bunidade\s+b[áa]sica\b|\bcentro\s+(esportivo|comunit[áa]rio|de\s+sa[úu]de)\b|\bpavilh[ãa]o\b|\bquadra\s+coberta\b/i;

/** True only when the object is open-air sport/recreation surfaces AND names no building. */
export function isPortugueseMunicipalSportsComponent(input: string): boolean {
  const text = foldAccents(input);
  if (!PT_MUNICIPAL_SPORTS_COMPONENT.test(text)) return false;
  return !PT_BUILDING_SCOPE.test(text);
}

/**
 * 小型工程 —— the class the user named on 2026-09-19, after reviewing a day of
 * real rows:
 *
 *   「我感觉所有国家都很多小学校(幼儿园、小型小学、乡村学校、社区学校、托儿所、
 *     学前教育)、小体育场、小广场、社区广场、社区体育场、社区道路、小型道路、
 *     社区医院、农村医院的标了，这些中国公司(即使已经在本地有实体了)一般不会参加…
 *     特别是没有预算金额的，根本辨识不了」
 *
 * ── Why this could not be another PT_EXCLUDE_KEYWORDS entry ───────────────
 *
 * Because every one of these titles carries a real works word.
 * classifyPortugueseExclusion() checks PT_REAL_WORKS_SIGNAL and returns null
 * the moment it sees `obra`, `construção`, `pavimentação` or `engenharia` —
 * a guard that exists so a rule broader than its own name cannot lose a real
 * R$50M highway. A creche IS construction. A village football pitch IS a
 * work. The guard is doing its job and the row still should not be in the
 * feed, so the verdict has to be taken before the guard, on what is BEING
 * BUILT rather than on whether something is.
 *
 * Measured, not assumed: of 23 Brazilian titles the user listed, the existing
 * rules excluded 0.
 *
 * ── The value exception ───────────────────────────────────────────────────
 *
 * None of this fires on a tender at or above LARGE_WORKS_BUILD_USD — the
 * caller applies isLargeWorksBuild(), the same helper and the same threshold
 * the municipal-amenity and water-network classes use. One rule ("a works
 * build at that scale is not the small thing this class is about"), not three
 * that drift apart. A row with NO amount therefore falls in, which is the
 * user's point: 没有预算金额的，根本辨识不了 — an unpriced village school is
 * exactly the row that cannot be told apart from anything else, and a
 * classifier that keeps it is guessing in the user's favour rather than
 * theirs.
 */

/**
 * Buildings whose class caps their size: schools of every Brazilian name,
 * daycare, neighbourhood health posts, community sport and squares.
 *
 * `escola` alone is deliberately NOT here. A federal institute or a technical
 * campus is a real building contract; `escola municipal`, `escola estadual`
 * and the rural/field variants are the village school the user means. The
 * qualifier is what makes the size claim, so the qualifier is required.
 */
const PT_SMALL_FACILITY =
  // Daycare and pre-school under all of Brazil's names for it. CMEI/CEMEI/
  // EMEI are the municipal acronyms and appear in titles without expansion,
  // so they are anchored on both sides rather than left loose.
  /\bcreche(s)?\b|\bcmei\b|\bcemei\b|\bemei\b|\bpre[\s-]?escola|\beducacao\s+infantil\b|\bbercario\b|\bturmas?\s+do\s+pre\b/i;

const PT_SMALL_FACILITY_LIST: RegExp[] = [
  PT_SMALL_FACILITY,
  // Village/municipal schools. The qualifier carries the size claim.
  /\bescola(s)?\s+(municipal|municipais|estadual|estaduais|rural(is)?|do\s+campo)\b|\bescola\s+m\.?\s/i,
  // Neighbourhood health: UBS, ESF and the posto. A hospital is NOT here —
  // a real hospital build is a contract a Chinese contractor would look at,
  // and the user named 社区医院/农村医院, not hospitals.
  /\bunidade(s)?\s+basica(s)?\s+de\s+saude\b|\bubs\b|\bposto(s)?\s+de\s+saude\b|\bestrategia\s+saude\s+da\s+familia\b/i,
  // Community sport and squares. `quadra` covers 小体育场/社区体育场,
  // `praça` the 小广场/社区广场, and MEU CAMPINHO is a named state programme
  // that builds exactly these (Paraná) — the programme name is the object.
  /\bquadra(s)?\s+(poli)?esportiva(s)?\b|\bcampo\s+society\b|\bespaco\s+esportivo\b|\bareninha(s)?\b|\bmeu\s+campinho\b/i,
  /\bpraca(s)?\s+(publica|de\s+convivencia|de\s+eventos|municipal)\b|\bparque\s+de\s+eventos\b/i,
  // School canteen, and the wall-and-facade job on one of the buildings above.
  /\brefeitorio\b|\bmuro\s+e\s+requalificacao\b|\brequalificacao\s+da\s+fachada\b/i,
  // Municipal slope protection — a retaining wall on a named street, which is
  // what every one of these is in practice.
  /\bcontencao\s+de\s+encosta(s)?\b/i,
];

/**
 * A street, not a road.
 *
 * The user's rule, in their own words: 街道路面不做，只做公路 — street
 * surfacing no, highways yes. So this needs all three of a paving verb, a
 * street-or-village marker, and the ABSENCE of a highway marker. Any two of
 * them is not enough: "pavimentação" alone is half the Brazilian corpus, and
 * a named street alone appears in genuine works as the site address.
 */
const PT_PAVING_VERB =
  /\bpavimenta[cç][aã]o\b|\bpavimentacao\b|\brecapeamento\b|\brepavimentacao\b|\bcapeamento\s+asfaltico\b|\bparalelepipedo\b|\bpedra\s+tosca\b|\bbloquete\b|\bc\.?\s?b\.?\s?u\.?\s?q\b/i;

const PT_LOCAL_SITE =
  /\brua\s+[a-z0-9]|\bavenida\s+[a-z0-9]|\bav\.\s*[a-z0-9]|\btravessa\b|\bbairro\b|\bloteamento\b|\bvila\s+[a-z]|\bzona\s+rural\b|\bestrada(s)?\s+vicinal(is|ais)?\b|\bpovoado\b|\bcomunidade\b|\bdistrito\s+de\b|\bquarteirao\b/i;

/**
 * What rescues a paving contract: the statutory road network.
 *
 * `BR-101`, `MG-050`, `SP-270` are federal and state highway designations —
 * two letters, a hyphen, three digits — and a contract naming one is not a
 * residential street however many `bairro`s the address also names.
 */
// `\b[a-z]{2}[\s-]\d{3}\b` was the first attempt and it was wrong in a way
// worth keeping: it matched "de 114" inside "com extensão de 114,00 metros",
// so a 114-metre residential street rescued itself by stating its own length.
// A Brazilian highway designation always carries the hyphen — BR-101, MG-050,
// SP-270 — so requiring it costs nothing and closes the hole.
const PT_HIGHWAY_MARKER =
  /\brodovia(s)?\b|\bbr[\s-]?\d{3}\b|\b[a-z]{2}-\d{3}\b|\banel\s+viario\b|\bduplicacao\b|\bcontorno\s+(rodoviario|viario)\b|\bvia\s+expressa\b|\brodoanel\b/i;

/**
 * Rural water-supply systems — the Portuguese half of WATER_NETWORK_KEYWORDS,
 * which is a Spanish list and therefore matched none of these.
 *
 * `área rural` is required. A municipal water system for a city of 200,000 is
 * a real contract; the same words with `em área rural` on the end is a set of
 * village standpipes.
 */
const PT_RURAL_WATER =
  /\b(sistemas?\s+de\s+)?abastecimento\s+de\s+agua\b[\s\S]{0,120}?\b(area|zona)\s+rural\b|\bsaneamento\s+rural\b/i;

/**
 * Keeping an existing asphalt surface alive, rather than building one.
 *
 * Separate from PT_PAVING_VERB because the words overlap and the verdict does
 * not: `pavimentação` builds a road, `conservação de pavimentos` patches one.
 * Real title this exists for names a whole state programme across three
 * municipalities and is still a maintenance retainer.
 */
const PT_PAVEMENT_UPKEEP =
  /\bconservacao\s+(preventiva|periodica|rotineira|de\s+pavimentos?)\b|\bmanutencao\s+de\s+pavimentos?\b|\btapa[\s-]?buraco(s)?\b/i;

/** A plan, a diagnosis or a study — engineering thinking, not engineering. */
const PT_PLAN_STUDY =
  /\bplano\s+diretor\b|\bestudo\s+de\s+viabilidade\b|\bdiagnostico\s+da\s+situacao\b/i;

/**
 * A title with no object in it.
 *
 * "OBRAS E INSTALAÇÕES" is a budget line item, not a description of anything
 * (user, 2026-09-19: 不清晰，直接排除). Length-bounded on purpose — the same
 * words inside a real 400-character object statement describe a real work.
 */
const PT_NO_OBJECT_TITLE = /^\s*obras?\s+e\s+instalacoes\b[\s.;,-]*$/i;

/**
 * Checked against the TITLE, never the haystack.
 *
 * classifyRelevance's haystack is title + summary + industry TAGS joined, so
 * "OBRAS E INSTALAÇÕES" arrives as "obras e instalacoes construction" and an
 * end-anchored pattern can never match it. The existing Spanish
 * NO_CONTENT_TITLE check reads input.title for exactly this reason; this is
 * the same rule in Portuguese, so it reads the same field.
 */
export function isPortugueseNoObjectTitle(title: string): boolean {
  return PT_NO_OBJECT_TITLE.test(foldAccents(title));
}

export type PortugueseSmallWorks = "small_local_works" | "consulting";

/**
 * The 小型工程 verdict for a Brazilian tender, taken BEFORE the works guard.
 *
 * Returns null for anything it does not recognise, so it can only ever
 * subtract from the feed on a class the user named — never on a shape it
 * happens to resemble.
 */
export function classifyPortugueseSmallWorks(input: string): PortugueseSmallWorks | null {
  const text = foldAccents(input);
  if (PT_PLAN_STUDY.test(text)) return "consulting";
  if (PT_PAVEMENT_UPKEEP.test(text)) return "small_local_works";
  if (PT_SMALL_FACILITY_LIST.some((pattern) => pattern.test(text))) return "small_local_works";
  if (PT_RURAL_WATER.test(text)) return "small_local_works";
  if (PT_PAVING_VERB.test(text) && PT_LOCAL_SITE.test(text) && !PT_HIGHWAY_MARKER.test(text)) return "small_local_works";
  return null;
}
