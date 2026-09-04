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
  isNationalPriorityProject?: boolean;
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
  {
    title: "Central de Generación Co-Localizada Los Cabos",
    expectedTier: "flagship",
    note: "Real proyectosmexico.gob.mx row (2026-09-02, project 1117, buyer Comisión Federal de Electricidad) — isNationalPriorityProject alone must force flagship even with no estimatedValue in this fixture (the real row had one; this checks the flag works standalone).",
    industries: ["energy", "power"],
    scopeType: "works",
    buyer: "Comisión Federal de Electricidad",
    isNationalPriorityProject: true,
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
    expectedTier: "excluded",
    note: "Was in the user's first (18-title) whitelist, then deliberately dropped from the narrower 13-title version without comment — confirmed intentional (2026-09-02) when asked directly. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Ingeniería, Procura y Construcción de ductos marinos en el Golfo de México, Paquete 2",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group as above, confirmed intentional. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción, rehabilitación y/o sustitución de líneas de descarga y de inyección de agua congénita con tubería no metálica para los activos de la Subdirección de Extracción Región Terrestre Norte",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group, confirmed intentional. Doesn't say 'ducto' literally — caught by the separate 'líneas de descarga' exclude pattern added alongside it.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Mantenimiento, rehabilitación e infraestructuras complementarias en instalaciones de las Regiones Marinas. (Paquete 2)",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group, confirmed intentional. Doesn't say 'ducto' either — caught by the separate 'infraestructuras complementarias' exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción de ductos terrestres para recolección y transporte de hidrocarburos en Instalaciones de Exploración y Extracción de Petróleos Mexicanos",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group as above, confirmed intentional. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "ADQUISICIÓN DE TRANSFORMADORES DE POTENCIA",
    expectedTier: "significant",
    note: "Was excluded since the Seventh pass removed the old bare 'energía|eléctrico|power' signal, with nothing replacing it for power equipment specifically. Restored to significant (2026-09-04) per the user's explicit request to whitelist power-grid key equipment (变压器/发电机/继电保护器/UPS) — via the same anchored purchase-verb pattern as vehicles, not the old broad bare-word match.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE LABORATORIO",
    expectedTier: "significant",
    note: "Earlier-approved real batch — lab equipment.",
    industries: ["healthcare"],
  },

  // --- "standard" tier eliminated (2026-09-02, user-confirmed): these were
  // "standard" earlier in the session — kept as fixtures to document the
  // reversal, not because they're still expected to classify that way.
  // Everything below now correctly lands "excluded" since only flagship +
  // the construction/medical-equipment whitelist stay visible by default. ---
  {
    title: "Servicio de calibración a equipos patrones para instrumentos de control y medición de las instalaciones de Petróleos Mexicanos",
    expectedTier: "excluded",
    note: "Was 'standard' (real PEMEX title with genuine hydrocarbon-facility content in the TITLE itself, not just buyer name — deliberately NOT caught by the buyer-tag-contamination fix since this is real content) — now excluded, same 'standard' elimination.",
    scopeType: "services",
    buyer: "Pemex Exploración y Producción",
  },

  // --- Vehicle-fleet purchases restored to the whitelist (2026-09-04, per
  // the user's explicit request) — a genuine ACQUISITION of vehicles now
  // promotes to "significant" via FLAGSHIP_INDUSTRY_KEYWORDS's new
  // vehicle-purchase pattern, while routine vehicle services (maintenance,
  // fuel) stay excluded exactly as before — see relevance.ts's comment on
  // that pattern for why the two can't collide. ---
  {
    title: "ADQUISICIÓN DE VEHÍCULOS PARA EL CONVENIO CONASAMA 2026",
    expectedTier: "significant",
    note: "Real title, same one the 2026-09-02 'standard' elimination had moved to excluded — restored per the user's 2026-09-04 explicit ask to whitelist government vehicle purchases.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE AUTOBUSES PARA TRANSPORTE ESCOLAR",
    expectedTier: "significant",
    note: "Bus purchase — 公交车, one of the user's named examples (2026-09-04).",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE CAMIONES DE VOLTEO PARA OBRAS PÚBLICAS",
    expectedTier: "significant",
    note: "Dump-truck purchase — 货车, one of the user's named examples (2026-09-04).",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE CAMIONETAS TIPO SUV PARA SEGURIDAD PÚBLICA",
    expectedTier: "significant",
    note: "SUV purchase — SUV, one of the user's named examples (2026-09-04); also exercises industry.ts's widened 'vehicles' pattern (SUV/camioneta weren't matched at all before this change).",
    industries: ["vehicles"],
  },
  {
    title: "SERVICIO DE MANTENIMIENTO PREVENTIVO Y CORRECTIVO AL PARQUE VEHICULAR",
    expectedTier: "excluded",
    note: "Regression check for the user's explicit 2026-09-04 concern ('避免触发...加油和保养'): vehicle MAINTENANCE, not a purchase — caught by the existing broad 'servicio de mantenimiento' EXCLUDE_KEYWORDS pattern before the new vehicle-purchase whitelist entry is ever reached.",
    industries: ["vehicles"],
  },
  {
    title: "SUMINISTRO DE GASOLINA Y DIÉSEL PARA EL PARQUE VEHICULAR",
    expectedTier: "excluded",
    note: "Regression check for the same 2026-09-04 concern: vehicle FUEL, not a purchase — caught by the existing 'combustible para el parque vehicular|suministro de gasolina y diésel' EXCLUDE_KEYWORDS pattern.",
    industries: ["vehicles"],
  },
  {
    title: "ARRENDAMIENTO DE VEHÍCULOS PARA EL PERSONAL ADMINISTRATIVO",
    expectedTier: "excluded",
    note: "Vehicle RENTAL, not a purchase — caught by the existing 'arrendamiento de vehículos|renta de vehículos' EXCLUDE_KEYWORDS pattern before the new whitelist entry, confirming the anchored purchase-verb pattern doesn't accidentally match this.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE MAQUINARIA PESADA",
    expectedTier: "significant",
    note: "Was 'standard' until the 2026-09-02 elimination moved it to excluded — restored per the user's 2026-09-04 follow-up ask (\"'maquinaria pesada' 也加回白名单\") to the SAME anchored purchase-verb pattern as the vehicle purchases above, not a separate rule.",
    industries: ["vehicles"],
  },
  {
    title: "ARRENDAMIENTO DE MAQUINARIA PESADA PARA OBRAS PÚBLICAS",
    expectedTier: "excluded",
    note: "Heavy-machinery RENTAL, not a purchase — no EXCLUDE_KEYWORDS pattern names machinery specifically, but the anchored whitelist pattern requires a purchase verb (adquisición/adqs./compra/suministro), which 'arrendamiento' isn't, so this falls through to the bottom below_threshold exclusion exactly like vehicle rental does.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE COMBUSTIBLES Y LUBRICANTES PARA VEHÍCULOS Y EQUIPOS TERRESTRES",
    expectedTier: "excluded",
    note: "Real title (2026-09-04) that exposed a real bug: 'vehículos' appears only 32 chars after 'adquisición de', inside the OLD whitelist pattern's 40-char loose gap, matching via the 'para vehículos' trailing modifier even though the actual object being purchased is fuel/lubricants, not vehicles. Fixed by tightening the gap to digits/quotes/whitespace only (a real quantity prefix, not arbitrary words) and adding an explicit belt-and-suspenders EXCLUDE_KEYWORDS pattern.",
    industries: ["vehicles", "energy"],
  },

  // --- Hemodiálisis/hemodinamia SERVICES and consumables, not equipment
  // (2026-09-04, real titles the user flagged) — same class of bug as the
  // earlier osteosíntesis/reactivo/medicamento fixes: the bare
  // "hemodiálisis|hemodinamia" FLAGSHIP_INDUSTRY_KEYWORDS term is meant for
  // genuine EQUIPMENT purchases, but these three are an outsourced service
  // and a consumables purchase respectively. ---
  {
    title: "ADQUISICIÓN Y/O SUMINISTRO DE INSUMOS PARA EL SERVICIO DE HEMODINAMIA, 2026",
    expectedTier: "excluded",
    note: "Consumables ('insumos') for the hemodinamia service, not equipment — would otherwise hit the bare 'hemodinamia' FLAGSHIP_INDUSTRY_KEYWORDS match.",
    industries: ["healthcare"],
  },
  {
    title: "SERVICIOS MEDICO DE HEMODIALISIS SUBROGADA",
    expectedTier: "excluded",
    note: "Outsourced ('subrogada') hemodiálisis service — word order didn't match the existing 'servicio médico subrogado' pattern ('subrogada' separated from 'medico' by 'de hemodialisis'), so it would otherwise hit the bare 'hemodiálisis' FLAGSHIP_INDUSTRY_KEYWORDS match.",
    scopeType: "services",
  },
  {
    title: "SERVICIO DE HEMODIÁLISIS EXTRAMUROS",
    expectedTier: "excluded",
    note: "Off-site ('extramuros') hemodiálisis service contract, real procedure number LA-50-GYR-050GYR033-T-91-2026 — same class of bug as the subrogada title above.",
    scopeType: "services",
  },

  // --- Power-grid key equipment restored to the whitelist (2026-09-04, per
  // the user's explicit request: "白名单加入电力相关的关键设备：变压器、
  // 发电机、继电保护器等" then "还有UPS") — same anchored purchase-verb
  // mechanism as vehicles, reusing the same tightened gap. ---
  {
    title: "ADQUISICIÓN DE GENERADORES DE EMERGENCIA PARA HOSPITALES",
    expectedTier: "significant",
    note: "Generator purchase — 发电机, one of the user's named examples (2026-09-04). Deliberately avoids the word 'subestación' — that already triggers INCLUDE_OVERRIDE_KEYWORDS straight to flagship on its own, which would test that rule instead of this one.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE RELEVADORES DE PROTECCIÓN PARA LÍNEAS DE TRANSMISIÓN",
    expectedTier: "significant",
    note: "Protection-relay purchase — 继电保护器, one of the user's named examples (2026-09-04). Mexican Spanish 'relevador' variant, not just 'relé'.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE UPS PARA EQUIPO DE CÓMPUTO",
    expectedTier: "significant",
    note: "UPS purchase, one of the user's named examples (2026-09-04, follow-up \"还有UPS\"). Deliberately avoids 'centro de datos' — that already triggers MAJOR_PROJECT_KEYWORDS straight to flagship on its own, which would test that rule instead of this one.",
    industries: ["power", "ict_telecom"],
  },
  {
    title: "MANTENIMIENTO PREVENTIVO A TRANSFORMADORES DE POTENCIA",
    expectedTier: "excluded",
    note: "Power-equipment MAINTENANCE, not a purchase — regression check mirroring the vehicle/machinery rental checks above: no purchase verb, so this falls through to the existing broad 'mantenimiento preventivo' EXCLUDE_KEYWORDS pattern before the whitelist entry is ever reached.",
    industries: ["power"],
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
