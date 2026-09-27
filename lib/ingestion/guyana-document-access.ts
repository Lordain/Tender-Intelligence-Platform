import type { BidDocumentAccess } from "@/types/tender";

/**
 * How a Guyanese notice says the full bid documents are obtained. eprocure.gov.gy
 * publishes only the notice; the documents themselves are bought, collected,
 * emailed or downloaded from the procuring entity, and every entity words it
 * differently. The 35 notices of 2026-09-27 used six routes, often combined:
 *
 *   download   "may be obtained by downloading it from www.electricity.gov.gy"
 *   email      "requested … upon the submission of a written application or
 *              email … The document will be sent by email" (World Bank)
 *   free       "will be sent a copy of the bidding documents free of cost via email"
 *   purchase   "a non-refundable fee of Five Thousand Guyana Dollars (G$5,000)"
 *   collect    "can be uplifted from the Procurement Office … upon payment"
 *   courier    "must submit an account number from a local courier agent that
 *              accepts freight collect charges" (Guyana Water Inc., CDB)
 *
 * Each flag is set only on the notice's own words; nothing is inferred, and
 * the matched sentences are kept (excerpt) so the page can show them.
 */

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const DOWNLOAD = /download(?:ed|ing)?\b[^.]{0,80}?\b(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i;
const BY_EMAIL = /(?:sent|forwarded|dispatched)\s[^.]{0,60}?(?:by|via)\s+e-?mail|(?:by|via)\s+e-?mail[^.]{0,120}?(?:free of cost|free of charge)|bidding package can be sent/i;
const FREE = /free of (?:cost|charge)/i;
/** The first amount after "non-refundable": every fee in the 2026-09-27 notices is introduced that way; bid-security amounts never are. */
const FEE = /non\s?-\s?refundable[^$]{0,90}?(?:G\$|GY\$|GYD\s?\$?|\$)\s?(\d{1,3}(?:,\d{3})+|\d+)/i;
const COLLECT = /uplift|to be collected|collected from|purchased from the cashier|via cash at|printed format/i;
const COURIER = /courier/i;
const FLASH_DRIVE = /(?:bidding|bid|tender) documents?[^.]{0,80}?flas[hk]\s?drive|flas[hk]\s?drive[^.]{0,40}?(?:bidding|bid|tender) documents?/i;
const INSPECTION = /inspect(?:ion)?\b[^.]{0,60}?(?:bidding|bid|tender) documents?|(?:bidding|bid|tender) documents?[^.]{0,60}?(?:first )?inspection/i;
/** Two of the five GWI lots of 2026-09-27 never close the quote, so a full stop before the next sentence ends it too. */
const REQUEST_TITLE = /clearly marked:?\s*[“"]\s*(Request for Bid(?:ding)? Documents? for [^”"]{3,200}?)\s*(?:[”"]|\.\s+(?=[A-Z]))/i;

/** Sentences about getting the documents, not about submitting bids. */
const ACCESS_SENTENCE = /bidding documents?|bid documents?|bidding package|download|non\s?-\s?refundable|courier|uplift|sent by e-?mail|clearly marked:?\s*[“"]\s*Request for Bid(?:ding)? Documents?/i;
const SUBMISSION_SENTENCE = /bid security|late bids|opened in the presence|evaluated in accordance|beneficial ownership|prescribed forms|must be (?:deposited|delivered|submitted)|shall deposit|valid (?:for|during)/i;
const EXCERPT_MAX = 1200;

function sentences(text: string): string[] {
  // Splits on a full stop followed by a capital or an opening bracket, but not
  // after "No", "Inc", "Co", "St" or a single initial, which the notices use
  // mid-sentence ("GWI Inc. Shelter Belt", "Region No. 4").
  return text.split(/(?<!\b(?:No|Inc|Co|St|Ltd|[A-Z]))[.;]\s+(?=[A-Z(“"\d])/);
}

export function readGuyanaDocumentAccess(noticeText: string | null): BidDocumentAccess | null {
  if (!noticeText) return null;
  const text = noticeText.replace(/\s+/g, " ");

  const excerptParts = sentences(text)
    .map((sentence) => sentence.trim())
    .filter((sentence) => ACCESS_SENTENCE.test(sentence) && !SUBMISSION_SENTENCE.test(sentence));
  let excerpt = "";
  for (const part of excerptParts) {
    const next = excerpt ? `${excerpt} ${part}.` : `${part}.`;
    if (next.length > EXCERPT_MAX) break;
    excerpt = next;
  }

  const download = DOWNLOAD.exec(text);
  const fee = FEE.exec(text);
  const requestTitle = REQUEST_TITLE.exec(text)?.[1]?.replace(/[.\s]+$/, "");
  const emails = [...new Set((text.match(EMAIL) ?? []).map((email) => email.toLowerCase().replace(/\.+$/, "")))];

  const access: BidDocumentAccess = {
    ...(download ? { downloadUrl: `https://${download[1].replace(/[.,;]+$/, "")}` } : {}),
    ...(download && /online form/i.test(text) ? { downloadNeedsForm: true } : {}),
    ...(BY_EMAIL.test(text) ? { byEmail: true } : {}),
    ...(FREE.test(text) ? { free: true } : {}),
    ...(fee ? { fee: { amount: Number(fee[1].replace(/,/g, "")), currency: "GYD" } } : {}),
    ...(COLLECT.test(text) ? { collectInPerson: true } : {}),
    ...(COURIER.test(text) ? { courier: true } : {}),
    ...(FLASH_DRIVE.test(text) ? { flashDrive: true } : {}),
    ...(INSPECTION.test(text) ? { inspection: true } : {}),
    ...(requestTitle ? { requestTitle } : {}),
    emails,
    excerpt,
  };

  // A notice that says none of this — nothing to tell a reader beyond the notice itself.
  const says = access.downloadUrl || access.byEmail || access.fee || access.collectInPerson || access.courier || access.inspection;
  return says ? access : null;
}

/** A scanned lot borrows its sibling's route; the request heading names the sibling's lot, so it is dropped. */
export function borrowedDocumentAccess(sibling: BidDocumentAccess): BidDocumentAccess {
  const { requestTitle: _dropped, ...rest } = sibling;
  void _dropped;
  return { ...rest, fromSibling: true };
}
