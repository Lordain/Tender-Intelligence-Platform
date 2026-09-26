/**
 * Client-safe labels for the 导入中标结果 admin panel — split out of
 * award-sources.ts so a "use client" component does not pull the connectors
 * and the Supabase admin client into the browser bundle (same split as
 * pemex-sources.ts).
 */
export type AwardSourceId = "mexico" | "brazil" | "chile" | "colombia" | "oxi" | "oece";

/** The command an operator runs where SEACE answers — shown by the admin panel instead of a button that always fails. */
export const PERU_OECE_AWARDS_COMMAND = "npm run cron:peru-oece-status -- --write";

export const AWARD_SOURCES: { id: AwardSourceId; label: string; hint: string }[] = [
  { id: "mexico", label: "墨西哥 Compras MX", hint: "LicitIA 逐条查询：日期、供应商、金额" },
  { id: "brazil", label: "巴西 PNCP", hint: "逐条查询：日期、供应商、金额" },
  { id: "chile", label: "智利 Mercado Público", hint: "OCDS 定标记录：日期、供应商、金额" },
  { id: "colombia", label: "哥伦比亚 SECOP II", hint: "日期、供应商、金额" },
  { id: "oxi", label: "秘鲁 OxI", hint: "全部状态清单：日期、金额（无企业名称）" },
  { id: "oece", label: "秘鲁 OECE", hint: "SEACE 拒绝服务器访问，只能本地命令行运行" },
];
