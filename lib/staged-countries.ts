/**
 * Countries being imported but not yet shown to visitors.
 *
 * A new country is imported, translated and reviewed in the admin pages for a
 * week or two before it opens — the plan for Guyana the user accepted on
 * 2026-09-27 (请基于你的建议做). AVAILABLE_COUNTRIES (lib/tender-list-page.ts) only filters
 * the /tenders list; the detail page, homepage, sitemap, digest mail and the
 * search-engine push all read the table without it. So a staged country is
 * named here and every one of those public exits drops its rows — the admin
 * pages read the table directly and still see them.
 *
 * Filtered in code, never with a SQL `country NOT IN (…)`: that would also
 * drop a row whose country is NULL. The filter only ever REMOVES rows of a
 * country listed here, so for every country already open it changes nothing. Opening a country means deleting
 * it from this list and adding it to AVAILABLE_COUNTRIES.
 */
// Argentina opened 2026-09-29 (user: 请帮忙前台+后台开放阿根廷).
// The Dominican Republic and Ecuador joined 2026-10-04 (user: 先接多米尼加和厄瓜多尔 ← OK);
// the Dominican Republic opened the same day (user: 公开多米尼加(前台+后台+网站内的文字描述)).
// Panama joined 2026-10-06 (user, on 先导入但不对外显示，你在后台审核一两周: OK).
export const STAGED_COUNTRIES: readonly string[] = ["Guyana", "Ecuador", "Panama"];

export function isStagedCountry(country: string | null | undefined): boolean {
  return country != null && STAGED_COUNTRIES.includes(country);
}
