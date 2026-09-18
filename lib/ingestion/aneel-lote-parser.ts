/**
 * ANEEL's transmission auction object text, turned into one row per LOTE.
 *
 * Written against a real capture: the ten lots the user pulled out of
 * www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm
 * on 2026-09-18, kept verbatim in __fixtures__/aneel-lotes-transmissao.txt.
 * That page is behind a Cloudflare challenge a script cannot pass but a real
 * browser can, so the text arrives by hand — the same route Compras MX,
 * Ecopetrol and Proyectos México already use.
 *
 * ── Why a LOTE is a row ───────────────────────────────────────────────────
 *
 * One auction is bid lot by lot. Each lot is a separate concession contract,
 * with its own RAP ceiling, its own investment estimate and its own winner —
 * a bidder takes lot 3 and ignores lots 1 to 10. Storing the auction as one
 * tender would merge ten unrelated opportunities into an unreadable row, so
 * the lot is the unit and the auction number is what groups them.
 *
 * ── The distinction that decides whether a lot is interesting ─────────────
 *
 * Lots come in two flavours and the text names them:
 *
 *   "Continuidade da prestação de serviço"  — existing lines whose concession
 *       is expiring, handed to whoever bids the lowest revenue. Almost no
 *       construction: you are buying an income stream and an O&M obligation.
 *   "Novas instalações de transmissão"      — greenfield. Lines and
 *       substations to be built.
 *
 * For a Chinese EPC or equipment maker those are opposite propositions, and
 * lot 1 here is both at once. `hasNewInstallations` / `hasContinuity` carry it
 * rather than a single guessed scope type.
 *
 * ── Two traps in the real text, both load-bearing ─────────────────────────
 *
 *  1. **Lot 2's installations are on the SAME LINE as its header**, after the
 *     colon. A parser that assumes "header line, then bullet lines" silently
 *     produces a lot with zero installations — which reads like a data
 *     problem rather than a parsing one.
 *  2. **Lot 10 says "nos Estado do Mato Grosso"** — plural preposition,
 *     singular noun. It is a typo in the source, and a state regex anchored on
 *     "no Estado de" / "nos Estados de" misses it. The pattern below accepts
 *     either ending on either form, because the source is typed by hand and
 *     will keep doing this.
 */

/** The 27 UFs, so a mapper can set the same `state` field every other Brazilian row uses. */
const UF_BY_STATE_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").toLowerCase();
}

export type AneelLote = {
  /** 1, 2, 3 … as printed. */
  number: number;
  /** Full names as written, e.g. ["Rio de Janeiro", "São Paulo", "Minas Gerais"]. */
  states: string[];
  /** UF codes for the same, e.g. ["RJ", "SP", "MG"]; a name that is not one of the 27 is dropped. */
  ufs: string[];
  /** Every installation line, as written, without its bullet and trailing punctuation. */
  installations: string[];
  /** "3A", "3B" … when the lot is split; empty otherwise. */
  sublotes: string[];
  /** The lot builds something new. */
  hasNewInstallations: boolean;
  /** The lot takes over existing assets whose concession is expiring. */
  hasContinuity: boolean;
  /** Highest kV named anywhere in the lot — the usual proxy for how big a job it is. */
  maxVoltageKv: number | null;
  /** The lot's whole text, kept so a summary or a model prompt can use the original wording. */
  text: string;
};

const LOTE_HEADER = /^\s*-?\s*LOTE\s+(\d+)\s*,/i;
// "no Estado de X" / "nos Estados do A, B e C" — and lot 10's "nos Estado do",
// which is a real typo in the source and would otherwise drop a whole lot's
// states. The preposition and the noun's number are allowed to disagree.
const STATES_CLAUSE = /\bnos?\s+Estados?\s+(?:de|do|da|dos|das)\s+([^:]+)/i;

function splitStates(clause: string): string[] {
  return clause
    .split(/\s*,\s*|\s+e\s+/i)
    .map((part) => part.replace(/^(?:de|do|da|dos|das)\s+/i, "").trim())
    .filter((part) => part.length > 1);
}

function voltagesIn(text: string): number[] {
  // "SE 500/230/138 kV" is three voltages behind one unit, and taking only the
  // number next to "kV" would read that lot as a 138 kV job when it is a 500.
  const groups = [...text.matchAll(/(\d{2,3}(?:\s*\/\s*\d{2,3})*)\s*kV/gi)];
  return groups.flatMap(([, group]) => group.split("/").map((value) => Number(value.trim()))).filter((value) => Number.isFinite(value) && value > 0);
}

/**
 * Splits the object text into lots and reads each one.
 *
 * Tolerant by design: the input is whatever the browser copied out of a
 * ColdFusion page written in 2009, so blank lines, stray bullets and
 * inconsistent spacing are expected rather than exceptional.
 */
export function parseAneelLotes(input: string): AneelLote[] {
  const lines = input.split(/\r?\n/);
  const blocks: { number: number; lines: string[] }[] = [];

  for (const line of lines) {
    const header = LOTE_HEADER.exec(line);
    if (header) {
      blocks.push({ number: Number(header[1]), lines: [line] });
      continue;
    }
    if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line);
  }

  return blocks.map(({ number, lines: blockLines }) => {
    const text = blockLines.join("\n").trim();
    const statesClause = STATES_CLAUSE.exec(blockLines[0] ?? "");
    const states = statesClause ? splitStates(statesClause[1]) : [];

    // Trap 1: lot 2 keeps its only installation on the header line, after the
    // colon. Everything after the first colon of the header counts as content.
    const headerTail = (blockLines[0] ?? "").split(/:/).slice(1).join(":");
    const contentLines = [headerTail, ...blockLines.slice(1)];

    const installations: string[] = [];
    for (const raw of contentLines) {
      for (const piece of raw.split(/(?=\s-\s(?:LT|SE|Trechos)\b)/i)) {
        const cleaned = piece.replace(/^\s*-\s*/, "").replace(/[;.]\s*$/, "").trim();
        if (cleaned === "") continue;
        // Only lines naming a real asset: LT (linha de transmissão), SE
        // (subestação), or "Trechos de LT". The sub-headings and the sublote
        // labels are structure, not installations.
        if (/^(?:LT\b|SE\b|Trechos\b)/i.test(cleaned)) installations.push(cleaned);
      }
    }

    const voltages = voltagesIn(text);
    return {
      number,
      states,
      ufs: states.map((name) => UF_BY_STATE_NAME[fold(name)]).filter((uf): uf is string => uf !== undefined),
      installations,
      sublotes: [...text.matchAll(/\bSublote\s+(\d+[A-Z])\b/gi)].map(([, id]) => id.toUpperCase()),
      hasNewInstallations: /\bNovas\s+instala[çc][õo]es\b/i.test(text),
      hasContinuity: /\bContinuidade\s+da\s+presta[çc][ãa]o\b/i.test(text),
      maxVoltageKv: voltages.length > 0 ? Math.max(...voltages) : null,
      text,
    };
  });
}
