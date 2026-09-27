/**
 * Where to go to download the files the admin import pages ask for by hand
 * (user, 2026-09-27: 需要手工加载的帮我加个点击就打开的链接). Client-safe:
 * the "use client" panels import it, so it must stay free of server code.
 */

/** ProInversión's OxI list; 「状态」→「全部」→「Exportar a Excel」 gives the all-states file. */
export const OXI_EXPORT_PAGE_URL = "https://www.investinperu.pe/inversiones-seleccion-oxi/";

export const ADMIN_EXTERNAL_LINK_CLASS = "font-bold text-[#b86e00] underline underline-offset-2 hover:text-[#8a5200]";
