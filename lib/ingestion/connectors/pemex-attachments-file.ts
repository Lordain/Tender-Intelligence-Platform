import { readFileSync } from "node:fs";

/**
 * One item's attachment list from PEMEX's SharePoint REST API
 * (`_api/web/lists/getbytitle('...')/items(<Id>)/AttachmentFiles`),
 * captured via the same anonymous, anti-bot-free access confirmed for the
 * item lists themselves — see pemex-mapper.ts and README.md.
 *
 * `Title` (the tender's procedure number) is carried alongside `Id` so
 * this file can be matched to an already-ingested tender by the same
 * `pemex-${slugify(Title)}` scheme pemex-mapper.ts uses, without a second
 * round trip to re-fetch the parent item.
 */
export type PemexAttachmentEntry = {
  Id: number;
  Title?: string;
  files: { FileName: string; ServerRelativeUrl: string }[];
};

export function readPemexAttachmentsFile(filePath: string): PemexAttachmentEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content) as PemexAttachmentEntry[];
  return Array.isArray(data) ? data : [];
}

/**
 * Downloads a real PEMEX attachment's bytes. Same anonymous, anti-bot-free
 * access already confirmed for the item lists and the AttachmentFiles
 * metadata call (see README.md's "PEMEX document references" section) —
 * unlike Compras MX documents, there is no `grc`/`igrc`/`xgrc` gate to
 * defeat here, so a plain unauthenticated fetch is all this needs.
 */
export async function downloadPemexDocument(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PEMEX document download responded ${response.status} ${response.statusText} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
