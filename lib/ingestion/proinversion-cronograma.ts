import type { LocalizedText } from "@/types/tender";
import { normalize, toIsoDay, type ParsedCronograma, type ParsedCronogramaRow } from "@/lib/ingestion/seace-cronograma";
import type { ExtractedKeyDateType } from "@/lib/ingestion/key-date-checks";

/**
 * Parses the cronograma of a ProInversión concurso's bases, pasted in by an
 * admin on the tender's edit page (user, 2026-10-10: 帮我做日期粘贴功能，像是
 * 系统中的SEACE … 要匹配我上面提供的日期 … 还涉及报名费).
 *
 * ProInversión's APP portfolio, which the daily import reads, states no dates
 * beyond the call (see connectors/peru-proinversion-app-live.ts); the bases
 * do, as a numbered list that pastes one cell per line:
 *
 *   1.1. Consultas a las Bases
 *   Hasta el jueves 24.09.2026
 *   3.1. Pago del Derecho de Participación
 *   Hasta el viernes 27.11.2026
 *   4.1. Presentación de los sobres Nro. 1 y Nro. 2 y Buena Pro (*)
 *   A los 30 días calendario de la entrega de la Versión Final de los Contratos (**)
 *
 * Every dated step is kept. The ones the platform has a type for get it; the
 * rest — the participation fee, the contract drafts, the qualification
 * result — become "milestone" rows named in Chinese with the bases' own
 * wording beside it, so the edit page and the tender page carry the whole
 * schedule. A step with no date of its own ("A los 30 días…") is reported,
 * not guessed.
 *
 * The deadline is the envelopes' date once the bases fix one. Until then it
 * is the qualification request: a company that has not applied by that day
 * cannot bid at all.
 */

/** DD.MM.YYYY, the bases' own form; DD/MM/YYYY is accepted as well. */
const DATE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/;
/** "1.1. Consultas a las Bases", "5. Fecha de Cierre del Concurso", with the date on the same line or the next. */
const STEP = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/;

type Rule = { match: RegExp; type: ExtractedKeyDateType | "milestone"; zh: string; en: string; mandatory?: true };

/** Ordered: the first match wins, so a more specific label comes before the one it shares words with. */
const RULES: Rule[] = [
  { match: /^consultas a las bases/, type: "questions_deadline", zh: "对招标文件提问截止", en: "Questions on the bases due" },
  { match: /^absolucion (a|de) (las )?consultas/, type: "milestone", zh: "答复提问截止", en: "Answers to questions" },
  { match: /bases consolidadas/, type: "milestone", zh: "发布最终版招标文件（Bases consolidadas）", en: "Consolidated bases published" },
  { match: /^sugerencias a la version inicial/, type: "milestone", zh: "对合同初稿提意见截止", en: "Comments on the initial draft contract due" },
  { match: /^segunda version de los contratos/, type: "milestone", zh: "发布合同第二稿", en: "Second draft contract published" },
  { match: /^sugerencias a la segunda version/, type: "milestone", zh: "对合同第二稿提意见截止", en: "Comments on the second draft contract due" },
  { match: /^tercera version de los contratos/, type: "milestone", zh: "发布合同第三稿", en: "Third draft contract published" },
  { match: /^sugerencias a la tercera version/, type: "milestone", zh: "对合同第三稿提意见截止", en: "Comments on the third draft contract due" },
  { match: /version final de los contratos/, type: "milestone", zh: "发布合同终稿", en: "Final contract published" },
  { match: /derecho de participacion/, type: "milestone", zh: "支付参与费（报名费）截止", en: "Participation fee due", mandatory: true },
  { match: /solicitud de calificacion|presentacion de (los )?(sobres|documentos) de calificacion|presentacion de credenciales/, type: "submission", zh: "资格申请截止", en: "Qualification request due" },
  { match: /^subsanacion de observaciones al sobre/, type: "milestone", zh: "补正第一号信封", en: "Envelope 1 corrections" },
  { match: /^subsanacion de observaciones/, type: "milestone", zh: "补正资格申请材料截止", en: "Qualification corrections due" },
  { match: /^anuncio de (la )?calificacion|^anuncio de (los )?(postores )?calificados/, type: "milestone", zh: "公布资格审查结果", en: "Qualified bidders announced" },
  { match: /consorcios/, type: "milestone", zh: "组建或变更联合体截止", en: "Consortium formation or changes due" },
  { match: /^presentacion de (los )?sobres|^presentacion de (las )?ofertas/, type: "opening", zh: "递交第一、二号信封", en: "Envelopes 1 and 2 submitted" },
  { match: /apertura del sobre|buena pro/, type: "award", zh: "开启第二号信封并授标（Buena Pro）", en: "Envelope 2 opened, concession awarded" },
  { match: /fecha de cierre/, type: "contract_signing", zh: "签约交割（Fecha de Cierre）", en: "Financial close" },
];

/** The step label without its trailing footnote marks: "… y Buena Pro (*)" → "… y Buena Pro". */
const clean = (label: string) => label.replace(/\s*\(\*+\)\s*$/, "").trim();

export function parseProinversionCronograma(pasted: string): ParsedCronograma {
  const lines = pasted.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const steps: { label: string; value: string; raw: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const step = STEP.exec(lines[i]);
    if (!step) continue;
    // A tab- or space-joined row carries its date on the same line.
    const sameLine = DATE.exec(step[2]);
    if (sameLine) {
      steps.push({ label: clean(step[2].slice(0, sameLine.index).replace(/\b(hasta el|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/gi, "").trim()), value: step[2].slice(sameLine.index), raw: lines[i] });
      continue;
    }
    const next = lines[i + 1];
    // A heading ("1. Bases") is followed directly by its first step.
    if (!next || STEP.test(next)) continue;
    steps.push({ label: clean(step[2]), value: next, raw: `${lines[i]} ${next}` });
    i += 1;
  }

  const rows: ParsedCronogramaRow[] = [];
  const ignored: { label: string; reason: string }[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();
  for (const { label, value, raw } of steps) {
    const key = normalize(label);
    if (seen.has(key)) continue; // the same step pasted twice
    seen.add(key);
    const match = DATE.exec(value);
    const date = match ? toIsoDay(match[1], match[2], match[3]) : null;
    if (!date) {
      ignored.push({ label, reason: `没有具体日期（${value}）` });
      continue;
    }
    const rule = RULES.find((entry) => entry.match.test(key));
    const notes: LocalizedText = { zh: rule?.zh ?? label, en: rule?.en ?? label, es: label };
    rows.push({ label, date, type: rule?.type ?? "milestone", raw, notes, ...(rule?.mandatory ? { mandatory: true } : {}) });
    if (!rule) unparsed.push(`${raw}（没认出是哪一步，按「其他节点」原文保存）`);
  }

  // Once the envelopes have a date of their own, that is the deadline, and
  // the qualification request becomes one more step before it.
  const envelopes = rows.find((row) => row.type === "opening");
  const qualification = rows.find((row) => row.type === "submission");
  if (envelopes) {
    if (qualification) qualification.type = "milestone";
    envelopes.type = "submission";
  } else if (qualification) {
    // The deadline column carries no name, and on its own the page would call
    // the qualification request 提交截止. This card says which step it is.
    rows.push({ ...qualification, type: "milestone", notes: { ...qualification.notes!, zh: "资格申请截止（即本页的提交截止）" } });
  }
  return { rows, ignored, unparsed };
}

/** The bases' schedule announces itself by its DD.MM.YYYY dates and its vocabulary. */
export function looksLikeProinversionCronograma(pasted: string): boolean {
  return /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(pasted) && /bases|calificaci[oó]n|buena pro|derecho de participaci[oó]n/i.test(pasted);
}
