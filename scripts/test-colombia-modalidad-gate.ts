/**
 * Guards the one production change behind `npm run survey:colombia`:
 * `mapSecopRowToTender`'s `ignoreModalidadGate` option.
 *
 * Two properties matter and they pull against each other. The option has to
 * actually open the gate (or the what-if diagnostic silently reports zero
 * extra tenders for every modalidad, which reads exactly like "widening
 * would gain nothing" — the one wrong answer that would stop the user from
 * acting). And it has to open ONLY the gate: every other rule — the value
 * floor, the direct-award exclusion, the required-field checks — must still
 * run, or the diagnostic over-promises instead.
 *
 * Also pins the default: no ingestion path passes the option, so a row that
 * is not a Licitación Pública must still map to null through the plain
 * two-argument call every connector makes.
 *
 * Usage: npm run test:colombia-modalidad-gate
 */
import { mapSecopRowToTender, isIngestedColombiaModalidad, isRailSpecialRegimeRow, type SecopProcesoRow } from "../lib/ingestion/colombia-mapper";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

/** Shaped like the real rows in colombia-mapper.ts's own field list — a big, plainly-relevant works tender so no OTHER rule has a reason to drop it. */
function row(overrides: Partial<SecopProcesoRow> = {}): SecopProcesoRow {
  return {
    entidad: "GOBERNACIÓN DE ANTIOQUIA",
    id_del_proceso: "CO1.BDOS.1234567",
    referencia_del_proceso: "LP-SOP-001-2026",
    nombre_del_procedimiento: "CONSTRUCCIÓN DE LA SUBESTACIÓN ELÉCTRICA Y LÍNEA DE TRANSMISIÓN 115 KV",
    descripci_n_del_procedimiento:
      "Construcción de subestación eléctrica 115 kV y línea de transmisión asociada, incluyendo suministro e instalación de transformadores de potencia.",
    fecha_de_publicacion_del: "2026-09-01T00:00:00.000",
    // ~USD 4.7M at lib/currency.ts's COP rate — comfortably over MIN_VALUE_USD.
    precio_base: "20000000000",
    modalidad_de_contratacion: "Licitación pública",
    ordenentidad: "Territorial",
    tipo_de_contrato: "Obra",
    fecha_de_recepcion_de: "2026-10-15T00:00:00.000",
    urlproceso: { url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1234567" },
    ...overrides,
  };
}

type Check = { label: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function check(label: string, pass: boolean, detail?: string) {
  checks.push({ label, pass, detail });
}

// --- The gate itself, unchanged ---------------------------------------
check("Licitación pública 通过门槛", isIngestedColombiaModalidad("Licitación pública"));
check("Licitación pública Obra Publica（无重音）通过门槛", isIngestedColombiaModalidad("Licitación pública Obra Publica"));
check("Selección Abreviada 不通过门槛", !isIngestedColombiaModalidad("Selección Abreviada de Menor Cuantía"));
check("Contratación Directa 不通过门槛", !isIngestedColombiaModalidad("Contratación Directa"));

// --- Default behaviour: every connector's plain two-argument call ------
check(
  "不传 option 时，Licitación pública 照常映射",
  mapSecopRowToTender(row(), SOURCE_NAME) !== null,
);
check(
  "不传 option 时，Selección Abreviada 仍然被拦（连接器行为没变）",
  mapSecopRowToTender(row({ modalidad_de_contratacion: "Selección Abreviada de Menor Cuantía" }), SOURCE_NAME) === null,
);
check(
  "传 { } 空 option 时行为和不传一致",
  mapSecopRowToTender(row({ modalidad_de_contratacion: "Selección Abreviada de Menor Cuantía" }), SOURCE_NAME, {}) === null,
);

// --- The option opens the gate ----------------------------------------
const abreviada = mapSecopRowToTender(
  row({ modalidad_de_contratacion: "Selección Abreviada de Menor Cuantía" }),
  SOURCE_NAME,
  { ignoreModalidadGate: true },
);
check("ignoreModalidadGate 让 Selección Abreviada 映射出来", abreviada !== null);
check(
  "映射出来的行保留真实 modalidad（诊断要按它分组）",
  abreviada?.procedureType === "Selección Abreviada de Menor Cuantía",
  `procedureType = ${abreviada?.procedureType}`,
);

// --- ...and ONLY the gate --------------------------------------------
// The whole value of the what-if is that these still fire. If they didn't,
// the diagnostic would count rows that the pipeline would never keep.
const directa = mapSecopRowToTender(
  row({ modalidad_de_contratacion: "Contratación Directa" }),
  SOURCE_NAME,
  { ignoreModalidadGate: true },
);
check("Contratación Directa 映射得出来，但仍被判为 excluded（直接授标规则照常生效）", directa?.relevance.tier === "excluded", `tier = ${directa?.relevance.tier}`);

const subasta = mapSecopRowToTender(
  row({ modalidad_de_contratacion: "Selección abreviada subasta inversa" }),
  SOURCE_NAME,
  { ignoreModalidadGate: true },
);
check("Subasta Inversa 仍被判为 excluded（2026-09-14 的规则照常生效）", subasta?.relevance.tier === "excluded", `tier = ${subasta?.relevance.tier}`);

const tiny = mapSecopRowToTender(
  row({ modalidad_de_contratacion: "Selección Abreviada de Menor Cuantía", precio_base: "40000000" }), // ~USD 9.5k
  SOURCE_NAME,
  { ignoreModalidadGate: true },
);
check("小金额仍被价格下限判为 excluded（放宽门槛不等于放宽金额）", tiny?.relevance.tier === "excluded", `tier = ${tiny?.relevance.tier}`);

const noTitle = mapSecopRowToTender(
  row({ modalidad_de_contratacion: "Selección Abreviada de Menor Cuantía", nombre_del_procedimiento: "", descripci_n_del_procedimiento: "" }),
  SOURCE_NAME,
  { ignoreModalidadGate: true },
);
check("缺标题的行仍然映射为 null（必填字段检查照常生效）", noTitle === null);

// --- Rail companies' régimen especial (user, 2026-09-26) -------------------
// Admitted only from the named rail companies, only when 大型项目, and never
// for a loan. Shaped on the real rows found in SECOP II the same day.
const metroMedellin = { entidad: "EMPRESA DE TRANSPORTE MASIVO DEL VALLE DE ABURRA LIMITADA", modalidad_de_contratacion: "Contratación régimen especial" };
check("铁路公司的特殊制度采购被识别为候选", isRailSpecialRegimeRow(metroMedellin));
check("带「(con ofertas)」的写法同样识别", isRailSpecialRegimeRow({ ...metroMedellin, modalidad_de_contratacion: "Contratación régimen especial (con ofertas)" }));
check("非铁路机构的特殊制度采购不是候选", !isRailSpecialRegimeRow({ entidad: "METROSALUD", modalidad_de_contratacion: "Contratación régimen especial" }));
check("铁路公司的直接合同（Contratación directa）不是候选", !isRailSpecialRegimeRow({ ...metroMedellin, modalidad_de_contratacion: "Contratación directa" }));

const railWorks = mapSecopRowToTender(row({
  ...metroMedellin,
  nombre_del_procedimiento: "CONSTRUCCIÓN DE OBRAS CIVILES Y SUMINISTRO DE MATERIAL RODANTE PARA LA LÍNEA DEL METRO",
  descripci_n_del_procedimiento: "Construcción de obras civiles del viaducto y suministro de trenes para la nueva línea del Metro de Medellín.",
  precio_base: "400000000000",
}), SOURCE_NAME);
check("铁路公司的大型特殊制度采购被收录", railWorks?.relevance.tier === "flagship", `tier = ${railWorks?.relevance.tier}`);

const railSmall = mapSecopRowToTender(row({
  ...metroMedellin,
  nombre_del_procedimiento: "SUMINISTRO DE REPUESTOS PARA ESCALERAS ELÉCTRICAS",
  descripci_n_del_procedimiento: "Suministro de repuestos para escaleras eléctricas de las estaciones.",
  precio_base: "900000000",
}), SOURCE_NAME);
check("铁路公司的小额特殊制度采购不收录", railSmall === null, `tier = ${railSmall?.relevance.tier}`);

const railLoan = mapSecopRowToTender(row({
  entidad: "METRO DE BOGOTA SA",
  modalidad_de_contratacion: "Contratación régimen especial",
  nombre_del_procedimiento: "Empréstito Banco Europeo de Inversiones - TRAMO D",
  descripci_n_del_procedimiento: "Por medio del contrato de crédito; el Banco Europeo de Inversiones establece a favor de la Empresa Metro de Bogotá un préstamo para la construcción de la Línea 2.",
  precio_base: "620400000000",
}), SOURCE_NAME);
check("贷款/融资协议不收录，金额再大也不收", railLoan === null, `tier = ${railLoan?.relevance.tier}`);

const otherSpecial = mapSecopRowToTender(row({ entidad: "ACUEDUCTO METROPOLITANO DE BUCARAMANGA S.A. E.S.P.", modalidad_de_contratacion: "Contratación régimen especial" }), SOURCE_NAME);
check("非铁路机构的大型特殊制度采购仍不收录（9/11 规则不变）", otherSpecial === null);

console.log("Colombia modalidad 门槛\n");
let failures = 0;
for (const c of checks) {
  if (c.pass) console.log(`  OK    ${c.label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${c.label}${c.detail ? `\n        ${c.detail}` : ""}`);
  }
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
if (failures > 0) process.exit(1);
