import Image from "next/image";
import { CountryFlag } from "@/components/tenders/CountryFlag";

/** Guides carry ISO codes; CountryFlag takes the English names the tenders use. */
const FLAG_COUNTRY: Record<string, string> = {
  MX: "Mexico",
  BR: "Brazil",
  CO: "Colombia",
  PE: "Peru",
  CL: "Chile",
  AR: "Argentina",
  DO: "Dominican Republic",
  PA: "Panama",
  EC: "Ecuador",
  BO: "Bolivia",
};

export function GuideCountryFlag({ code }: { code: string }) {
  return <CountryFlag country={FLAG_COUNTRY[code] ?? ""} className="ring-1 ring-black/10" />;
}

/**
 * Each platform's own icon, taken from its official site (favicon, touch icon
 * or header logo) and redrawn at 128px in public/guides/logos/<slug>.png
 * (user, 2026-10-04: 能不能找到每个平台的官方图标，加入图标？). CFE's and
 * Proyectos Estratégicos MX's sites could not be reached from here, so theirs
 * come from logo files the user supplied: the CFE lettering, and the hexagon
 * symbol without the wordmark.
 */
export function GuideLogo({ slug }: { slug: string }) {
  return (
    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e5e9ea] bg-white p-1.5">
      <Image src={`/guides/logos/${slug}.png`} alt="" width={32} height={32} className="size-full object-contain" />
    </span>
  );
}

/**
 * The platform as the guide cards label it. Only where the full name is too
 * long for a card line (user, 2026-10-04: 巴西不用写全名，写PNCP就可以); the
 * guide's own page keeps `platform` in full.
 */
const GUIDE_PLATFORM_SHORT: Record<string, string> = {
  "panama-panamacompra": "PanamaCompra",
  "ecuador-soce": "SOCE",
  "bolivia-sicoes": "SICOES",
  "brazil-pncp": "PNCP",
  "argentina-adif": "ADIF · Portal de Licitaciones",
};

export function guidePlatformLabel(guide: { slug: string; platform: string }) {
  return GUIDE_PLATFORM_SHORT[guide.slug] ?? guide.platform;
}
