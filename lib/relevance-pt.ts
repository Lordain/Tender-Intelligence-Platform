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

export type PortugueseExclusion = "keyword" | "maintenance_only";

/**
 * Whether a Brazilian tender is routine enough to keep out of the feed.
 *
 * Returns null for anything carrying a real works signal, so the guard is
 * applied in one place rather than negated inside a dozen patterns.
 */
export function classifyPortugueseExclusion(text: string): PortugueseExclusion | null {
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
  ["construction", /\bobras?\s+de\s+(engenharia|implanta[çc][ãa]o|amplia[çc][ãa]o|reforma)\b|constru[çc][ãa]o|edifica[çc][õo]es|pavimenta[çc][ãa]o|recapeamento|reforma\s+e\s+amplia[çc][ãa]o|requalifica[çc][ãa]o|urbaniza[çc][ãa]o|terraplanagem|empreitada|\bengenharia\s+civil\b/i],
  // `esgoto` (sewerage), `drenagem pluvial` (storm drainage) and `bueiro`
  // (culvert) are the words a Brazilian title uses; none of them appear in
  // the Spanish water pattern.
  ["water", /\besgotos?\b|saneamento\s+b[áa]sico|drenagem(\s+pluvial)?|\b[áa]gua\s+(pot[áa]vel|para\s+consumo\s+humano)\b|esta[çc][ãa]o\s+de\s+tratamento|\bbueiro(s)?\b|\bre?servat[óo]rios?\b|barragem|\bdragagem\b/i],
  ["power", /energia\s+el[ée]trica|rede\s+de\s+distribui[çc][ãa]o\s+de\s+energia|subesta[çc][ãa]o|ilumina[çc][ãa]o\s+p[úu]blica|projetos?\s+el[ée]tricos?|luminot[ée]cnic[oa]/i],
  ["ict_telecom", /fibra\s+[óo]ptica|conex[ãa]o\s+dedicada\s+[àa]\s+internet|videomonitoramento|\bdatacenter\b|intelig[êe]ncia\s+urbana/i],
];

/** Portuguese-only industry tags. Returns [] rather than ["general"] — the caller merges this with the Spanish pass, which already supplies that fallback. */
export function classifyPortugueseIndustries(text: string): IndustryKey[] {
  return PT_INDUSTRY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
}
