/**
 * The same procurement stored under two slugs.
 *
 * Found 2026-10-10 (user: 请检查，确保不是重复): AGETO, Tocantins' transport
 * agency, published the TO-428 road contract on PNCP twice an hour apart —
 * 17684344000160-1-000053/2026 from Comprasnet and …-000054/2026 by hand —
 * same processo (2026/38960/000678), same R$67,559,727.19, same deadline.
 * Slugs are built from the source's own id, so each posting became its own
 * tender. The same pattern showed in several other Brazilian groups.
 *
 * Two rows are the same procurement when ALL of these match: country, buyer,
 * estimated amount (to the cent, same currency), the submission deadline's
 * calendar day, and the title once case, accents, punctuation and spacing are
 * folded away. Deliberately strict: separate lots of one programme carry
 * different amounts or titles, and a reposted notice with a new deadline is a
 * different row. A row without an amount or a deadline is never matched.
 */

export type ProcurementFingerprintInput = {
  country: string | null | undefined;
  buyer: string | null | undefined;
  title: string | null | undefined;
  estimatedValue: number | null | undefined;
  currency: string | null | undefined;
  submissionDeadline: string | null | undefined;
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The matching key, or null when the row lacks a field the rule needs. */
export function procurementFingerprint(input: ProcurementFingerprintInput): string | null {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(input.submissionDeadline ?? "")?.[0];
  const title = fold(input.title ?? "");
  const buyer = fold(input.buyer ?? "");
  if (!day || !title || !buyer || !input.country) return null;
  if (input.estimatedValue === null || input.estimatedValue === undefined || !Number.isFinite(input.estimatedValue) || input.estimatedValue <= 0) return null;
  return [input.country, buyer, (input.currency ?? "").toUpperCase(), input.estimatedValue.toFixed(2), day, title].join("|");
}

/**
 * Every key a row can match another on: the strict one above, plus — for
 * Brazil only — the same key without the title.
 *
 * Added the same day, after the cleanup preview: eight more Brazilian pairs
 * matched on buyer, amount and deadline but not title, and each checked
 * against PNCP was one procurement posted twice minutes apart with the same
 * edital or processo number (67/2026 and 67, 82 and CE0082, CC 90330 and
 * 90330), one copy worded from the buyer's own system and one by hand. On
 * PNCP an amount to the cent, from one buyer, closing the same day, is one
 * procurement. Mexico is the reason it stays Brazil-only: Compras MX carries
 * template schools for different campuses at one identical amount and
 * deadline, which are genuinely separate projects.
 */
export function procurementFingerprints(input: ProcurementFingerprintInput): string[] {
  const strict = procurementFingerprint(input);
  if (!strict) return [];
  if (input.country !== "Brazil") return [strict];
  const loose = procurementFingerprint({ ...input, title: "any" });
  return loose ? [strict, `loose|${loose}`] : [strict];
}

/**
 * Rows that share any key from procurementFingerprints(), as groups of two or
 * more. A row linked to a second through one key and to a third through
 * another lands in one group with both.
 */
export function groupDuplicateProcurements<T>(rows: readonly T[], idOf: (row: T) => string, inputOf: (row: T) => ProcurementFingerprintInput): T[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id);
    if (up === undefined || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const firstIdByKey = new Map<string, string>();
  for (const row of rows) {
    const id = idOf(row);
    for (const key of procurementFingerprints(inputOf(row))) {
      const first = firstIdByKey.get(key);
      if (first === undefined) firstIdByKey.set(key, id);
      else if (find(id) !== find(first)) parent.set(find(id), find(first));
    }
  }
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const root = find(idOf(row));
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Mexico: one procedure number is one procurement, whichever source brought it.
 *
 * Found 2026-11-10: seven Proyectos Estratégicos procedures (FP-09-210-
 * 009000999-T-21…26, FP-09-JZO-009JZO001-I-3/I-4) were stored twice, once as
 * `comprasmx-fp-…` from the LicitIA feed and once as `proyectosestrategicos-
 * fp-…` from the admin's own export upload. The two sources slug into
 * different namespaces on purpose, and the fingerprint above never matched
 * them because the two spell the buyer differently (a full agency name
 * against its acronym). Both directions happened: four with LicitIA first,
 * and three where LicitIA wrote a minute after the upload, having read the
 * existing numbers three minutes before it.
 *
 * The user's rule (谁先进来留谁): a NEW row whose number is already stored
 * under another slug is not written; the row already there keeps being
 * updated by its own source. Checked at write time, so it holds however long
 * a source spent between reading and writing.
 *
 * Mexico only. A Mexican procedure number names its buying unit and is unique
 * nationally (LO-09-JZO-009JZO001-T-36-2026); a Colombian one is an
 * entity-local sequence — every municipality has its own LP-006-2026 — and
 * matching on it would drop real, different projects.
 */
export type StoredNumberRow = { slug: string; tenderNumber: string | null; country: string | null };

export function sameNumberDuplicates(
  tenders: readonly { slug: string; tenderNumber: string; country: string }[],
  stored: readonly StoredNumberRow[],
): { slug: string; twin: string }[] {
  const key = (number: string | null | undefined) => (number ?? "").trim().toUpperCase();
  const storedSlugs = new Set(stored.map((row) => row.slug));
  const owner = new Map<string, string>();
  for (const row of stored) {
    if (row.country !== "Mexico" || !key(row.tenderNumber)) continue;
    if (!owner.has(key(row.tenderNumber))) owner.set(key(row.tenderNumber), row.slug);
  }
  const dropped: { slug: string; twin: string }[] = [];
  for (const tender of tenders) {
    const number = key(tender.tenderNumber);
    if (tender.country !== "Mexico" || !number) continue;
    // Already stored under this slug: an update, never refused.
    if (storedSlugs.has(tender.slug)) {
      if (!owner.has(number)) owner.set(number, tender.slug);
      continue;
    }
    const twin = owner.get(number);
    if (twin && twin !== tender.slug) {
      dropped.push({ slug: tender.slug, twin });
      continue;
    }
    // First of its number in this import claims it for the rest.
    owner.set(number, tender.slug);
  }
  return dropped;
}
