import type { ExtractedKeyDateType } from "@/lib/ingestion/key-date-checks";
import {
  DATE_TOKEN,
  normalize,
  parseSeaceCronograma,
  toIsoDay,
  type ParsedCronograma,
  type ParsedCronogramaRow,
} from "@/lib/ingestion/seace-cronograma";

/**
 * Parses the CRONOGRAMA DE EVENTOS block of a Proyectos Estratégicos MX
 * procedure page, pasted in by an admin.
 *
 * Same reason the SEACE parser exists, different shape. This source publishes
 * its schedule as labelled fields rather than a table:
 *
 *   Fecha y hora de presentación y apertura de proposiciones:
 *   08/10/2026 11:00
 *
 * so rows cannot be found by scanning for dates the way the SEACE table is
 * read — the label and its value are on separate lines, and half the fields
 * (Lugar de apertura, Aplica visita, Plazo del procedimiento) carry no date
 * at all. Each field is matched by its LABEL, and the value is taken from the
 * same line when it is there and from the next line otherwise, which is how
 * it arrives when the page is selected with a mouse.
 *
 * Two things about this source specifically:
 *
 * - **Presentación y apertura is ONE act.** Mexico schedules submission and
 *   opening together, so that single field yields TWO key dates on the same
 *   day. Taking only one loses either the deadline a bidder must meet or the
 *   session they must attend, and taking the "opening" reading alone — which
 *   the label invites — is exactly what left live PEMEX tenders with an
 *   opening date and no deadline at all (see extract-requirements.ts's
 *   schedule instructions, fixed the same day for the same reason).
 * - **Two different aclaraciones dates.** "Fecha y hora límite para envío de
 *   aclaraciones" is the questions deadline; "Fecha y hora de junta de
 *   aclaraciones" is the meeting that answers them, and it comes AFTER. The
 *   límite rule is tested first because the junta label is a substring of
 *   neither but both contain "aclaraciones" — matching loosely would file the
 *   deadline as the meeting and move it a day.
 */

/** Ordered: the más-específico label must be tested before the one it shares words with. */
const FIELD_RULES: { match: RegExp; types: ExtractedKeyDateType[] }[] = [
  { match: /limite para envio de aclaraciones|limite para el envio de aclaraciones/, types: ["questions_deadline"] },
  { match: /junta de aclaraciones/, types: ["clarification"] },
  // One act, two facts. See the header.
  { match: /presentacion y apertura de proposiciones|presentacion y apertura de ofertas/, types: ["submission", "opening"] },
  { match: /acto del fallo|del fallo/, types: ["award"] },
  { match: /inicio del contrato/, types: ["contract_signing"] },
  { match: /visita al sitio|visita a las instalaciones|fecha.*visita/, types: ["site_visit"] },
];

const IGNORED_RULES: { match: RegExp; reason: string }[] = [
  { match: /fecha y hora de publicacion|fecha de publicacion/, reason: "发布日由数据源提供并受保护，不从粘贴内容覆盖" },
  { match: /^lugar /, reason: "是地点不是日期" },
  { match: /^aplica visita/, reason: "只说明是否有踏勘，没有日期" },
  { match: /^plazo del procedimiento/, reason: "是程序类型（NORMAL/CORTO），没有日期" },
];

/** The label sits before the colon; everything after it, plus the next line, is where the value can be. */
function splitLabel(line: string): { label: string; sameLineValue: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  return { label: line.slice(0, colon), sameLineValue: line.slice(colon + 1) };
}

function firstDateIn(text: string): string | null {
  DATE_TOKEN.lastIndex = 0;
  const match = DATE_TOKEN.exec(text);
  return match ? toIsoDay(match[1], match[2], match[3]) : null;
}

export function parseProyectosEstrategicosCronograma(pasted: string): ParsedCronograma {
  const rows: ParsedCronogramaRow[] = [];
  const ignored: { label: string; reason: string }[] = [];
  const unparsed: string[] = [];

  const lines = pasted.split(/\r?\n/).map((line) => line.trim());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const split = splitLabel(line);
    // A bare value line belongs to the label above it, which already consumed
    // it; anything else with no colon is not a field of this block.
    if (!split) continue;

    const { label, sameLineValue } = split;
    const normalized = normalize(label);

    const ignoredRule = IGNORED_RULES.find((rule) => rule.match.test(normalized));
    if (ignoredRule) {
      ignored.push({ label: label.trim(), reason: ignoredRule.reason });
      continue;
    }

    const rule = FIELD_RULES.find((entry) => entry.match.test(normalized));
    if (!rule) {
      // Only complain about labels that look like they were meant to carry a
      // date — the block is pasted whole, headings and all.
      if (/fecha/.test(normalized)) unparsed.push(line);
      continue;
    }

    // The value is after the colon, or on the following line when the paste
    // broke there (which is how a mouse selection of this page arrives).
    const next = lines[i + 1] ?? "";
    const date = firstDateIn(sameLineValue) ?? firstDateIn(next);
    if (!date) {
      // "Aplica visita: NO" shape — a known field that simply has no date.
      ignored.push({ label: label.trim(), reason: "该字段本次没有日期" });
      continue;
    }

    const raw = firstDateIn(sameLineValue) ? line : `${line} ${next}`.trim();
    for (const type of rule.types) rows.push({ label: label.trim(), date, type, raw });
  }

  return { rows, ignored, unparsed };
}

/**
 * Picks the parser by what was actually pasted, so one textarea takes either
 * source. The two formats are unmistakable: SEACE is a table whose header row
 * is Etapa / Fecha Inicio / Fecha Fin, Proyectos Estratégicos is a list of
 * "Fecha y hora de …:" labels. Detection looks for the label shape first
 * because a SEACE paste never contains it.
 */
export function parseAnyCronograma(pasted: string): ParsedCronograma & { format: "seace" | "proyectos-estrategicos" } {
  if (/fecha y hora/i.test(pasted)) {
    return { ...parseProyectosEstrategicosCronograma(pasted), format: "proyectos-estrategicos" };
  }
  // SEACE is the default for anything that does not announce itself as the other.
  return { ...parseSeaceCronograma(pasted), format: "seace" };
}
