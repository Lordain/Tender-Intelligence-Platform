/**
 * Permanent regression fixtures for lib/relevance.ts's classifyRelevance().
 *
 * This is the "growing whitelist" the user asked for (2026-09-02): a rule-
 * based Pre-Screening filter (see relevance.ts's own header comment for why
 * this stays rule-based rather than ML — it's a cheap Layer 1 cost-control
 * pass that has to run before any paid AI call) can't literally "train" on
 * new data, but it CAN remember every real, human-confirmed example
 * permanently and re-verify all of them on every future rule change. That's
 * what this file is: every real tender title/case the user has explicitly
 * confirmed the correct tier for, across this whole session, kept as a
 * permanent test case rather than a one-off verification script that gets
 * thrown away.
 *
 * Workflow going forward: when the user pastes new real examples with a
 * stated expected tier, append them here (with a `note` explaining the
 * source/reasoning) and run `npm run test:relevance`. A failure means
 * either the new case needs a rule change, or an existing rule regressed —
 * exactly the check that would have caught the "puertos" plural gap
 * immediately instead of by chance.
 */

import type { TenderScopeType } from "@/types/tender";

export type RelevanceFixture = {
  title: string;
  expectedTier: "flagship" | "significant" | "standard" | "excluded";
  note: string;
  summary?: string;
  industries?: string[];
  scopeType?: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
  buyer?: string;
};

export const RELEVANCE_FIXTURES: RelevanceFixture[] = [
  // --- Flagship: real MAJOR_PROJECT_KEYWORDS matches ---
  {
    title: "CONSTRUCCIÓN DE PRESA Y RED DE RIEGO",
    expectedTier: "flagship",
    note: "Dam construction — MAJOR_PROJECT_KEYWORDS 建水库/水坝.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE PUENTE VEHICULAR SOBRE EL RÍO",
    expectedTier: "flagship",
    note: "Bridge construction — MAJOR_PROJECT_KEYWORDS 建桥.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "AMPLIACIÓN DE AEROPUERTO INTERNACIONAL",
    expectedTier: "flagship",
    note: "Airport expansion — MAJOR_PROJECT_KEYWORDS 建机场.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "DRAGADO DE DESAZOLVE DE LOS PUERTOS DE CHUBURNA Y CHABIHAU",
    expectedTier: "flagship",
    note: "Real title (2026-09-02 export) — port dredging. Used PLURAL 'puertos', which \\bpuerto\\b (singular only) missed until the pluralization fix.",
    industries: ["general"],
    scopeType: "works",
  },
  {
    title: "Macro RAN 4G LTE para sitios rurales",
    expectedTier: "flagship",
    note: "Real ICT/telecom equipment batch — INCLUDE_OVERRIDE_KEYWORDS (RAN).",
    industries: ["ict_telecom"],
    scopeType: "equipment",
  },
  {
    title: "OBRA CIVIL",
    expectedTier: "flagship",
    note: "Synthetic — value >= FLAGSHIP_VALUE_USD alone should promote regardless of title content.",
    industries: ["construction"],
    scopeType: "works",
    estimatedValue: 5_000_000,
    currency: "USD",
  },

  // --- Significant: real examples the user confirmed as "keep" (2026-09-02) ---
  {
    title: "CONSTRUCCIÓN DE EDIFICIO H PARA LA FACULTAD DE ENFERMERÍA Y OBSTETRICIA 2A ETAPA",
    expectedTier: "significant",
    note: "User-confirmed keep list — building construction (FLAGSHIP_INDUSTRY_KEYWORDS construcción).",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO MÉDICO Y DE LABORATORIO",
    expectedTier: "significant",
    note: "User-confirmed keep list — medical/lab equipment.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPOS DE RAYOS X PARA DIVERSAS UNIDADES MEDICAS",
    expectedTier: "significant",
    note: "User-confirmed keep list — imaging equipment (rayos x).",
  },
  {
    title: "EQUIPO MÉDICO DE IMAGENOLOGÍA 2026, MASTÓGRAFOS Y RESONANCIA",
    expectedTier: "significant",
    note: "User-confirmed keep list — imaging equipment (imagenología/resonancia).",
  },
  {
    title: "ADQUISICIÓN DE 39 PARTIDAS DE EQUIPO ASOCIADO A OBRA - EQUIPAMIENTO MÉDICO INST",
    expectedTier: "significant",
    note: "User-confirmed keep list — bulk medical equipment tied to a works project.",
  },
  {
    title: "CONSTRUCCIÓN DE PLANTA DE TRATAMIENTO DE  AGUAS RESIDUALES",
    expectedTier: "significant",
    note: "User-confirmed keep list — wastewater treatment plant construction.",
  },
  {
    title: "ADQUISICION DE 204 PARTIDAS DE EQUIPO ASOCIADO A OBRA - EQUIPAMIENTO MÉDICO P&P",
    expectedTier: "significant",
    note: "User-confirmed keep list — bulk medical equipment tied to a works project.",
  },
  {
    title: "CONSTRUCCIÓN DE EDIFICIO ADMINISTRATIVO EN LA ESCUELA PREPARATORIA NO. UNO 3A E",
    expectedTier: "significant",
    note: "User-confirmed keep list — building construction, deliberately kept despite being its 3rd phase (per the earlier decision NOT to encode phase-count as an exclude signal).",
  },
  {
    title: "CONSTRUCCIÓN DE LA PLANTA DE TRATAMIENTO DE AGUAS RESIDUALES, STA. ANA DEL VALLE",
    expectedTier: "significant",
    note: "User-confirmed keep list — wastewater treatment plant construction.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE LABORATORIO PARA CENTROS DE ACOPIO EN SINALOA",
    expectedTier: "significant",
    note: "User-confirmed keep list — lab equipment.",
  },
  {
    title: "REHABILITACIÓN DE LA CARRETERA",
    expectedTier: "significant",
    note: "User-confirmed keep list — highway rehab (bare 'carretera' match; not 'construcción de la carretera' so stays significant, not flagship).",
  },
  {
    title: "CONSTRUCCIÓN Y DISEÑO DE 68.00 KM DEL TRAMO I FERROVIARIO DEL TREN DE PASAJEROS",
    expectedTier: "significant",
    note: "User-confirmed keep list — passenger railway construction. Matches via bare 'construcción', not the MAJOR_PROJECT_KEYWORDS railway pattern (ferrocarril/tren de carga|eléctrico|interurbano) — 'ferroviario' and 'tren de pasajeros' don't match that pattern's exact wording.",
  },
  {
    title: "CONSTRUCCIÓN Y DISEÑO DE 82.00 KM DEL TRAMO II FERROVIARIO DEL TREN DE PASAJERO",
    expectedTier: "significant",
    note: "User-confirmed keep list — passenger railway construction, same pattern gap as above.",
  },
  {
    title: "Mantenimiento, rehabilitación y/o construcción de ductos y líneas de descarga en los Activos de la Subdirección de Extracción Región Terrestre Norte",
    expectedTier: "significant",
    note: "User-confirmed keep list — PEMEX pipeline construction, kept despite starting with 'Mantenimiento,' because the exact EXCLUDE_KEYWORDS maintenance phrases (mantenimiento preventivo/correctivo/general/etc.) don't match this exact wording, and 'construcción' matches independently.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Ingeniería, Procura y Construcción de ductos marinos en el Golfo de México, Paquete 2",
    expectedTier: "significant",
    note: "User-confirmed keep list — offshore pipeline EPC.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción, rehabilitación y/o sustitución de líneas de descarga y de inyección de agua congénita con tubería no metálica para los activos de la Subdirección de Extracción Región Terrestre Norte",
    expectedTier: "significant",
    note: "User-confirmed keep list — PEMEX pipeline construction/rehab.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Mantenimiento, rehabilitación e infraestructuras complementarias en instalaciones de las Regiones Marinas. (Paquete 2)",
    expectedTier: "significant",
    note: "User-confirmed keep list — matches via bare 'infraestructuras'.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción de ductos terrestres para recolección y transporte de hidrocarburos en Instalaciones de Exploración y Extracción de Petróleos Mexicanos",
    expectedTier: "significant",
    note: "User-confirmed keep list — onshore pipeline construction.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "ADQUISICIÓN DE TRANSFORMADORES DE POTENCIA",
    expectedTier: "significant",
    note: "Earlier-approved real batch — power equipment.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE LABORATORIO",
    expectedTier: "significant",
    note: "Earlier-approved real batch — lab equipment.",
    industries: ["healthcare"],
  },

  // --- Standard: real cases that should stay visible but not promoted ---
  {
    title: "ADQUISICIÓN DE VEHÍCULOS PARA EL CONVENIO CONASAMA 2026",
    expectedTier: "standard",
    note: "Earlier-approved real batch — vehicle fleet purchase, below SIGNIFICANT_VALUE_USD with no other promotion signal.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE MAQUINARIA PESADA",
    expectedTier: "standard",
    note: "Earlier-approved real batch — heavy machinery, same as above.",
    industries: ["vehicles"],
  },
  {
    title: "Servicio de calibración a equipos patrones para instrumentos de control y medición de las instalaciones de Petróleos Mexicanos",
    expectedTier: "standard",
    note: "Real PEMEX title with genuine hydrocarbon-facility content in the TITLE itself (not just buyer name) — deliberately NOT excluded by the buyer-tag-contamination fix, since this is real content, not buyer-only noise.",
    scopeType: "services",
    buyer: "Pemex Exploración y Producción",
  },

  // --- Excluded: real noise confirmed this session ---
  {
    title: "REHABILITACIÓN DE POZO PROFUNDO NO. 5",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 只聚焦一个区的小工程 (single-well rehab).",
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE BARDA PERIMETRAL EN LA UABJO 2A. ETAPA",
    expectedTier: "excluded",
    note: "Real counter-example for why '多期项目(2期以上)' was NOT encoded as a major-project signal — a small fence job on its 2nd phase.",
    scopeType: "works",
  },
  {
    title: "SUPERVISIÓN DE LA CONSTRUCCIÓN DEL PASO SUPERIOR FERROVIARIO",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 只是监理 (inspection/oversight only, not the actual works contract).",
    scopeType: "consulting",
  },
  {
    title: "ANÁLISIS DE AGUAS RESIDUALES DE LA PLANTA",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 分析服务 (analysis service, not equipment/works).",
    scopeType: "services",
  },
  {
    title: "MANTENIMIENTO PREVENTIVO A TORRES DE ENFRIAMIENTO, UNIDADES PAQUETE",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 维护类服务 (routine HVAC/industrial-unit maintenance).",
    scopeType: "services",
  },
  {
    title: "COLGATE TRIPLE ACCION EXTRA, PAPEL HIGIENICO REGIO RINDE",
    expectedTier: "excluded",
    note: "Real title from ALIMENTACIÓN PARA EL BIENESTAR (Mexico's federal food/hygiene program) — 207 of 208 of this buyer's kept tenders were bare retail product names. EXCLUDE_BUYER_KEYWORDS fix.",
    scopeType: "equipment",
    estimatedValue: 139220,
    buyer: "ALIMENTACIóN PARA EL BIENESTAR, S.A. DE C.V.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE COMPUTO",
    expectedTier: "excluded",
    note: "Real title (SECADMONZAC buyer) — generic office equipment, no industry match, no value. Confirms the isEquipmentPurchase fallback removal (was previously kept as 'standard' purely for having scopeType='equipment').",
    scopeType: "equipment",
  },
  {
    title: "REQ 2026-0294 ADQ MONEDAS 10 PESOS ORO",
    expectedTier: "excluded",
    note: "Real title (ININ buyer) — commemorative coin purchase, same isEquipmentPurchase-fallback-removal confirmation as above.",
    scopeType: "equipment",
  },
  {
    title: "REHAB. PAVIM. CON MEZCLA ASFALT. EN CALIENTE CALLE S/N RA. CHICOZAPOTE",
    expectedTier: "excluded",
    note: "Real title — single-street asphalt patch, 'works' scope with no value. Confirms the isWorksLike flagship-fallback removal (was previously auto-flagship purely for scopeType='works').",
    scopeType: "works",
  },
  {
    title: "MANTENIMIENTO EN EDIFICIOS DE LA TERMINAL DE TRANSBORDADORES, MAZATLÁN",
    expectedTier: "excluded",
    note: "Real title — a maintenance job, 'works' scope with no value. Same isWorksLike-removal confirmation.",
    scopeType: "works",
  },
];
