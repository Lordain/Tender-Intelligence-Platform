/**
 * ANEEL's *consulta pública* — the draft edital, months before the edital.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * lib/ingestion/aneel-auction-stage.ts was written on 2026-09-18 against
 * Leilão 1/2026's document page and concluded, correctly for that page, that
 * the earliest signal available was a despacho sending the minuta to the TCU
 * and that no investment figure existed anywhere yet.
 *
 * That was the earliest signal *on that page*. It is not the earliest signal
 * ANEEL publishes. Before the minuta goes to the TCU it goes to the public:
 * ANEEL opens a numbered consulta pública, publishes the draft edital with
 * its annexes and draft contract, and takes written contributions for six to
 * eight weeks. Two things follow, and both matter more than the stage name:
 *
 *  1. **The investment estimate exists at this stage.** Leilão de Transmissão
 *     1/2027 was announced with R$ 12,9 bilhões when CP 032/2026 opened —
 *     seven months before the auction and long before any edital. The
 *     mapper's old claim that the number "does not exist yet, anywhere" was
 *     true of 1/2026's document page and false as a general statement.
 *  2. **The technical specification is still changeable.** A contribution
 *     sent during the window is the only formal way to argue about a spec
 *     before it becomes binding — round-trip efficiency floors, standalone
 *     operation, local-content rules. For a bidder who needs to know whether
 *     its equipment qualifies at all, this window IS the product.
 *
 * ── Provenance, stated plainly ────────────────────────────────────────────
 *
 * Every record below was read from trade press, not from ANEEL: the sandbox
 * cannot reach any .gov.br host and www2.aneel.gov.br refuses a script. Each
 * entry therefore carries `confirmed: false` and the URL it came from, and
 * `npm run ingest:aneel` prints that provenance before it writes anything.
 * A capture of the consulta's own page replaces the guesswork; nothing here
 * pretends to be a reading of the source.
 */

/** Which auction family the draft edital belongs to. They live on different ANEEL applications. */
export type AneelAuctionSegment =
  /** Transmission concessions — editais_transmissao. */
  | "transmissao"
  /** Reserve capacity (LRCAP), which is where the battery auctions sit — editais_geracao. */
  | "reserva_capacidade";

export type AneelConsultaPublica = {
  /** "CP 032/2026" → 32. */
  number: number;
  year: number;
  segment: AneelAuctionSegment;
  /** The auction whose draft edital is under consultation: 1/2027, 5/2026, … */
  auctionNumber: number;
  auctionYear: number;
  /** First and last day for contributions, ISO. */
  opensOn: string;
  closesOn: string;
  /** The address ANEEL takes contributions at, when it names one. */
  contributionsEmail: string | null;
  /** A public hearing inside the window, when one is scheduled. */
  audienciaPublicaOn: string | null;
  /**
   * The auction date, ISO — null when the schedule names a pair of days
   * without saying which auction falls on which. A guess here would put a
   * wrong deadline in front of a bidder.
   */
  auctionDate: string | null;
  /**
   * Announced CAPEX for the WHOLE auction, in BRL. Never divided across lots:
   * the split is not published and inventing one would put a fabricated
   * figure on every row. It is named in the summary instead.
   */
  announcedInvestmentBrl: number | null;
  /** How many lots the draft offers, when announced. */
  loteCount: number | null;
  /** One line a reader needs — what is unusual about this draft. */
  note: string;
  /** Where these fields were read. Press until a capture of ANEEL's own page replaces it. */
  provenanceUrl: string;
  /** False until the fields have been checked against ANEEL's own consulta page. */
  confirmed: boolean;
};

export type ConsultaWindowState = "upcoming" | "open" | "closed";

export function consultaWindowState(consulta: AneelConsultaPublica, now: Date = new Date()): ConsultaWindowState {
  const today = now.toISOString().slice(0, 10);
  if (today < consulta.opensOn) return "upcoming";
  // Inclusive: a consultation closing on the 26th takes contributions ON the 26th.
  if (today > consulta.closesOn) return "closed";
  return "open";
}

/** How many days are left to send a contribution; negative once the window has closed. */
export function daysUntilConsultaCloses(consulta: AneelConsultaPublica, now: Date = new Date()): number {
  const close = Date.parse(`${consulta.closesOn}T23:59:59Z`);
  return Math.ceil((close - now.getTime()) / 86_400_000);
}

export function consultaLabel(consulta: AneelConsultaPublica): string {
  return `Consulta Pública nº ${String(consulta.number).padStart(3, "0")}/${consulta.year}`;
}

/**
 * Where to look, on the one ANEEL host that answers.
 *
 * Read out of a capture of ANEEL's own homepage (2026-09-19, user's browser),
 * not guessed: these are the hrefs the site's own navigation carries. That
 * matters because of which host they are on. `www.gov.br/aneel` answered 200
 * with ~22k characters and 777 links from BOTH the user's laptop and the
 * deployment, while every other ANEEL door is shut — `www2` and `git.aneel`
 * behind a Cloudflare challenge, `leilao.aneel`, `dadosabertos.aneel` and
 * `portalrelatorios.aneel` at TCP timeout from two continents. So the
 * consultation stage is the one part of the auction lifecycle reachable
 * without changing network egress.
 *
 * ANEEL runs three distinct participation instruments and they are not
 * synonyms, which is why all three are listed:
 *
 *  - **Tomada de subsídios** — the earliest, before a draft exists at all;
 *    ANEEL asks the market what the rules should say.
 *  - **Consulta pública** — the draft edital itself, with annexes and draft
 *    contract, open for written contributions. This is the one that carries
 *    the investment figure and the technical spec.
 *  - **Audiência pública** — an oral session, usually inside a consulta's
 *    window rather than instead of it.
 *
 * `aneel-auction-stage.ts`'s CONSULTATION pattern already matches the first
 * two by name; this capture is what confirms they are formally separate
 * instruments rather than one thing ANEEL words two ways.
 *
 * None of these pages has been captured yet — only their addresses are
 * confirmed. A save of the consultas-publicas index is what would turn
 * ANEEL_CONSULTAS below from typed to measured.
 */
export const ANEEL_PARTICIPATION_URLS = {
  tomadaDeSubsidios: "https://www.gov.br/aneel/pt-br/acesso-a-informacao/participacao-social/tomada-de-subsidios",
  consultasPublicas: "https://www.gov.br/aneel/pt-br/acesso-a-informacao/participacao-social/consultas-publicas",
  audienciasPublicas: "https://www.gov.br/aneel/pt-br/acesso-a-informacao/participacao-social/audiencias-publicas",
} as const;

/**
 * The consultations open or recently closed as of 2026-09-19.
 *
 * Seeded rather than fetched, for the access reason in the header. Kept small
 * and dated on purpose: this is a worklist of what to capture, not a database.
 */
export const ANEEL_CONSULTAS: AneelConsultaPublica[] = [
  {
    number: 32,
    year: 2026,
    segment: "transmissao",
    auctionNumber: 1,
    auctionYear: 2027,
    opensOn: "2026-09-10",
    closesOn: "2026-10-26",
    contributionsEmail: "cp032_2026@aneel.gov.br",
    audienciaPublicaOn: null,
    auctionDate: "2027-04-30",
    announcedInvestmentBrl: 12_900_000_000,
    loteCount: 12,
    note:
      "Primeiro leilão de transmissão com lote de armazenamento por baterias no SIN: o Lote 5 atende Cruzeiro do Sul e Feijó (AC) e tem prazo de 18 anos, contra 30 anos dos demais lotes. O certame prevê 3.245 km de novas linhas e 1.386 MVA de transformação em 13 estados.",
    provenanceUrl: "https://www.osetoreletrico.com.br/leilao-marcado-para-abril-de-2027-o-primeiro-com-contratacao-de-baterias-na-transmissao-entra-em-consulta-publica/",
    confirmed: false,
  },
  {
    number: 22,
    year: 2026,
    segment: "reserva_capacidade",
    auctionNumber: 5,
    auctionYear: 2026,
    opensOn: "2026-07-30",
    closesOn: "2026-09-14",
    audienciaPublicaOn: "2026-09-01",
    contributionsEmail: null,
    // The MME schedule names 2 and 4 December without saying which auction is
    // on which day. Left null rather than guessed — see the type's comment.
    auctionDate: null,
    announcedInvestmentBrl: null,
    loteCount: null,
    note:
      "LRCAP 2026 — Armazenamento Nacional: minuta do edital, anexos e do Contrato de Reserva de Capacidade (CRCAP). Leilão previsto para 2 ou 4 de dezembro de 2026.",
    provenanceUrl: "https://www.mattosfilho.com.br/unico/armazenamento-energia-lrcap-aneel/",
    confirmed: false,
  },
  {
    number: 23,
    year: 2026,
    segment: "reserva_capacidade",
    auctionNumber: 6,
    auctionYear: 2026,
    opensOn: "2026-07-30",
    closesOn: "2026-09-14",
    audienciaPublicaOn: "2026-09-01",
    contributionsEmail: null,
    auctionDate: null,
    announcedInvestmentBrl: null,
    loteCount: null,
    note:
      "LRCAP 2026 — Armazenamento: minuta do edital, anexos e CRCAP, par da CP 022/2026. Leilão previsto para 2 ou 4 de dezembro de 2026.",
    provenanceUrl: "https://www.mattosfilho.com.br/unico/armazenamento-energia-lrcap-aneel/",
    confirmed: false,
  },
];

/** Looks a consultation up by the auction it drafts — the key a captured edital page gives us. */
export function findConsultaForAuction(
  auctionNumber: number,
  auctionYear: number,
  segment: AneelAuctionSegment = "transmissao",
  consultas: AneelConsultaPublica[] = ANEEL_CONSULTAS,
): AneelConsultaPublica | null {
  return (
    consultas.find(
      (c) => c.auctionNumber === auctionNumber && c.auctionYear === auctionYear && c.segment === segment,
    ) ?? null
  );
}
