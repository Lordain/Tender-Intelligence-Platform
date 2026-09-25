/**
 * How far back the power, oil and mining companies' sources import by
 * publication date — Petronect, UPME, Codelco and Cemig — and, since the
 * user's call of 2026-09-25 (智利每日自动导入的范围 <- 1–3 天), Chile's
 * Mercado Público daily run too.
 *
 * Each of those sources lists every process still open, however old; a
 * Petronect opportunity can take bids for five months. The user's call
 * (2026-09-25, 我只想要最近3天发布的): only what was published in the last three
 * days is imported. Three rather than one so a day the job fails — or a
 * source that posts a day late — is still caught by the next run.
 *
 * `--days N` on the command line overrides it for a one-off backfill;
 * `--days 0` means no window at all.
 */
export const COMPANY_SOURCE_WINDOW_DAYS = 3;

/** `--days N` from argv, or the default. Throws on a value that is not a whole number ≥ 0, rather than guessing. */
export function windowDaysFromArgv(argv: string[] = process.argv, fallback: number = COMPANY_SOURCE_WINDOW_DAYS): number {
  const index = argv.indexOf("--days");
  if (index < 0) return fallback;
  const raw = argv[index + 1];
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0) throw new Error(`--days 要是 0 以上的整数（0 = 不限），收到 "${raw}"`);
  return days;
}
