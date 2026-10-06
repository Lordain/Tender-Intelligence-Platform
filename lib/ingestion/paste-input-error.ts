/**
 * The admin pasted something the import cannot read: no procedure page, or a
 * link with no page next to it. Shown on the form and nothing else. It is not
 * a system fault, so the paste routes do not file it as a 系统告警 (user,
 * 2026-10-06, finding 「只贴了链接…」 among the alerts).
 */
export class PasteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasteInputError";
  }
}
