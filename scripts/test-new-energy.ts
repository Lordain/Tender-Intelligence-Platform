/**
 * The new-energy whitelist (lib/new-energy.ts): what it recognises, what it
 * refuses, and its effect on the pregão and subasta classifiers and the
 * industry tags. The general classifier's cases are in lib/relevance-fixtures.ts.
 *
 * Usage: npm run test:new-energy
 */
import { classifyIndustries } from "../lib/industry";
import { isNewEnergy, isNewEnergyPower } from "../lib/new-energy";
import { classifyPortugueseIndustries } from "../lib/relevance-pt";
import { classifyPncpPregaoRelevance, pregaoEquipmentClasses } from "../lib/relevance-pncp-pregao";
import { classifyColombiaSubastaRelevance } from "../lib/relevance-colombia-subasta";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

console.log("new-energy\n\n识别（西语、葡语）");
for (const text of [
  "SUMINISTRO E INSTALACIÓN DE PANELES SOLARES FOTOVOLTAICOS",
  "CONSTRUCCIÓN DEL PARQUE EÓLICO",
  "ADQUISICIÓN DE SISTEMA DE ALMACENAMIENTO DE ENERGÍA EN BATERÍAS (BESS)",
  "Suministro de baterías de ion de litio para respaldo",
  "PLANTA DE HIDRÓGENO VERDE CON ELECTROLIZADOR DE 10 MW",
  "INSTALACIÓN DE ESTACIONES DE CARGA PARA VEHÍCULOS ELÉCTRICOS",
  "SUMINISTRO DE INVERSORES FOTOVOLTAICOS",
  "Fornecimento e a instalação de sistemas de geração de energia solar fotovoltaica conectados à rede (on grid)",
  "Implantação de usina solar fotovoltaica",
  "Aquisição de sistema de armazenamento de energia em baterias",
  "Instalação de eletropostos para recarga de veículos elétricos",
]) check(text, isNewEnergyPower(text), true);
check("电动公交车 → 新能源（车辆类，不打电力）", [isNewEnergy("ADQUISICIÓN DE 40 BUSES ELÉCTRICOS PARA EL SISTEMA INTEGRADO DE TRANSPORTE"), isNewEnergyPower("ADQUISICIÓN DE 40 BUSES ELÉCTRICOS PARA EL SISTEMA INTEGRADO DE TRANSPORTE")], [true, false]);

console.log("\n不算新能源");
for (const text of [
  "MANTENIMIENTO DEL SISTEMA FOTOVOLTAICO Y PANELES SOLARES",
  "ADMINISTRACIÓN; OPERACIÓN Y MANTENIMIENTO DE LAS SOLUCIONES INDIVIDUALES SOLARES FOTOVOLTAICAS",
  "ADQUIRIR KITS SOLARES PARA AMBIENTES DE FORMACION",
  "Compra de materiales de formación - Proyecto Nacional Energías Fotovoltaicas en el Territorio",
  "ESTUDIOS DE FACTIBILIDAD PARA PARQUE SOLAR",
  "INSTALACIÓN DE CALENTADORES SOLARES EN VIVIENDAS",
  "plantas potabilizadoras de agua (módulo compacto) operado mediante energía solar",
  "Contratação de empresa para fornecimento de cortinas tipo rolo em tela solar screen",
  "SUMINISTRO DE BATERÍAS PARA VEHÍCULOS DE LA FLOTA",
  "SERVICIO DE ALMACENAMIENTO DE INFORMACIÓN EN LA NUBE",
]) check(text, isNewEnergy(text), false);

console.log("\n行业标签");
check("储能 → 电力", classifyIndustries("ADQUISICIÓN DE SISTEMA DE ALMACENAMIENTO DE ENERGÍA EN BATERÍAS (BESS)"), ["power"]);
check("充电桩 → 电力", classifyIndustries("INSTALACIÓN DE ELECTROLINERAS EN LA CIUDAD"), ["power"]);
check("葡语光伏 → 电力", classifyPortugueseIndustries("Fornecimento e instalação de sistemas de geração de energia solar fotovoltaica"), ["power"]);

console.log("\n巴西电子竞价（Pregão）");
const acre = "Fornecimento e a instalação de sistemas de geração de energia solar fotovoltaica conectados à rede (on grid) destinados às unidades do Poder Judiciário do Estado do Acre";
check("阿克里州并网光伏（真实，2026-10-01）→ 电力设备类", pregaoEquipmentClasses(acre), ["power"]);
check("R$ 1,690 万 → 常规", classifyPncpPregaoRelevance({ title: acre, estimatedValue: 16_900_000, currency: "BRL" }).relevance.tier, "standard");
check("R$ 300 万（约 58 万美元）→ 新能源门槛 50 万，留", classifyPncpPregaoRelevance({ title: acre, estimatedValue: 3_000_000, currency: "BRL" }).relevance.tier, "standard");
check("R$ 200 万（约 39 万美元）→ 排除", classifyPncpPregaoRelevance({ title: acre, estimatedValue: 2_000_000, currency: "BRL" }).relevance.tier, "excluded");
check("同样 R$ 300 万的变压器 → 仍按巴西 200 万美元门槛排除", classifyPncpPregaoRelevance({ title: "Aquisição de transformadores de distribuição", estimatedValue: 3_000_000, currency: "BRL" }).relevance.tier, "excluded");
check("光伏系统维护 → 不是设备采购", pregaoEquipmentClasses("Manutenção preventiva e corretiva dos sistemas fotovoltaicos"), []);

console.log("\n哥伦比亚逆向竞价（Subasta Inversa）");
check("光伏组件 20 亿比索（约 63 万美元）→ 常规", classifyColombiaSubastaRelevance({ title: "SUMINISTRO DE MODULOS SOLARES FOTOVOLTAICOS E INVERSORES", estimatedValue: 2_000_000_000, currency: "COP" }).relevance.tier, "standard");
check("SENA 实训用光伏组件（真实）→ 排除", classifyColombiaSubastaRelevance({
  title: "MODULOS SOLARES FOTOVOLTAICOS",
  summary: "Adquirir equipos, maquinaria y materiales de formación necesarios para la modernización tecnológica del ambiente de formación destinado para la producción didáctica y validación de módulos solares fotovoltaicos",
  estimatedValue: 3_172_828_950,
  currency: "COP",
}).relevance.tier, "excluded");
check("太阳能驱动的净水设备（真实）→ 排除", classifyColombiaSubastaRelevance({
  title: "Subasta inversa",
  summary: "Adquisición transporte e instalación a todo costo de plantas potabilizadores/dispensadores de agua (módulo compacto) operado mediante energía solar, para el fortalecimiento y garantía de acceso a agua potable en instituciones educativas",
  estimatedValue: 2_647_572_165,
  currency: "COP",
}).relevance.tier, "excluded");
check("储能不再被当成 ICT 存储", classifyColombiaSubastaRelevance({ title: "ADQUISICIÓN DE SISTEMA DE ALMACENAMIENTO DE ENERGÍA EN BATERÍAS", estimatedValue: 4_000_000_000, currency: "COP" }).industries, ["power"]);

if (failures > 0) {
  console.log(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
