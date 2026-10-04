import { foldAccents } from "@/lib/text-fold";

/**
 * New energy — solar PV, wind, battery storage, green hydrogen, EV charging
 * and electric buses — as a priority whitelist (user, 2026-10-04: 光伏、新能源
 * 项目是后续我们会关注的重点，优先白名单; floor 新能源白名单的门槛，用 50 万美元
 * ← OK).
 *
 * Chinese exporters to Latin America are disproportionately in exactly these
 * products, and the classifier was losing them in four measured places:
 *
 *   - Brazil's pregão filter did not recognise "sistemas de geração de energia
 *     solar fotovoltaica" (Acre, R$16.9M, 2026-10-01), so the row was dropped
 *     before its amount was even read.
 *   - "BESS", "almacenamiento de energía", "baterias … armazenamento" carried
 *     no industry tag at all.
 *   - Colombian PV supply-and-install contracts of US$0.5–1M fell under the
 *     US$1M floor (twelve months of SECOP II: 4–5 rows).
 *   - Colombian PV component supply ("SUMINISTRO DE COMPONENTES DEL SISTEMA
 *     SOLAR FOTOVOLTAICO (CELDAS PANELES SOLARES…)", US$726k) was excluded as
 *     执行期少于 150 天 — a supplier's delivery window, not a small job.
 *
 * What the whitelist does (lib/relevance.ts, lib/relevance-pncp-pregao.ts,
 * lib/relevance-colombia-subasta.ts, lib/industry.ts, lib/relevance-pt.ts):
 *
 *   - tags the row 电力 (power), Spanish and Portuguese alike;
 *   - lowers the value floor to NEW_ENERGY_MIN_VALUE_USD;
 *   - exempts it from the short-duration rule and the undisclosed-value
 *     village-scale and municipal gates;
 *   - lets a Brazilian pregão and a Colombian subasta inversa in as power
 *     equipment.
 *
 * What it does not do: promote. A keyword says what kind of thing is bought,
 * never how much, so the tier still comes from the amount (and from the
 * existing MAJOR_PROJECT_KEYWORDS entry for a whole solar or wind plant).
 * Upkeep, studies, training kits and solar water heaters are not the
 * whitelist — NOT_NEW_ENERGY — and keep the general rules.
 *
 * Applies to new imports only; stored rows are not reclassified (user's
 * standing rule, 2026-10-02: 库里的不动了 … 只应用于未来新导入的).
 */

export const NEW_ENERGY_MIN_VALUE_USD = 500_000;

/** Generation, storage, hydrogen and charging — the power-equipment side. Matched on accent-folded text, case-insensitively. */
const NEW_ENERGY_POWER =
  /fotovoltaic|photovoltaic|\bpain(?:eis|el) solar(?:es)?\b|\bpaneles? solares?\b|\bmodulos? (?:solares|fotovoltaicos)\b|\b(?:planta|parque|central|centrales|usina|granja|huerto|complejo|complexo)s? (?:de (?:generacion |geracao )?(?:energia )?)?(?:solar(?:es)?|eolic[oa]s?)\b|\benergia (?:solar|eolica)\b|\b(?:generacion|geracao) (?:de energia )?(?:solar|eolica)\b|\bsistemas? (?:de energia )?solar(?:es)?\b|\baerogenerador|\baerogerador|\bturbinas? eolicas?\b|\balmacenamiento (?:de energia|energetico|en baterias)\b|\barmazenamento (?:de energia|em baterias)\b|\bsistemas? de almacenamiento de energia\b|\bbess\b|\bsaeb\b|\bbaterias? (?:de )?(?:ion(?:es)?[- ](?:de )?)?litio\b|\bbaterias? (?:de|para) (?:almacenamiento|armazenamento)\b|\bbanco de baterias\b|\bhidrogeno verde\b|\bhidrogenio verde\b|\belectroliza?dor(?:es)?\b|\beletrolisador(?:es)?\b|\belectrolineras?\b|\beletropostos?\b|\b(?:estacion(?:es)?|puntos?|estac(?:ao|oes)|pontos?) de (?:re)?carga (?:para |de )?(?:vehiculos|veiculos) el(?:e|ec)tricos\b|\b(?:cargadores?|carregadores?) (?:para |de )?(?:vehiculos|veiculos) el(?:e|ec)tricos\b|\binversor(?:es)? (?:solar(?:es)?|fotovoltaic|hibrid|on-?grid|de (?:red|rede|string))|\bmicro-?rr?ed(?:es)?\b|\bmini-?redes? solares?\b/i;

/** Electric buses and fleets — new energy, but tagged as vehicles, which they already are. */
const NEW_ENERGY_VEHICLES =
  /\b(?:buses|autobuses|omnibus|onibus|micro-?onibus|vehiculos|veiculos|camiones|caminhoes|taxis|flota|frota)\s+(?:100% )?el(?:e|ec)tric[oa]s?\b|\b(?:buses|onibus) (?:cero|zero) emisiones?\b|\belectromovilidad\b|\beletromobilidade\b/i;

/**
 * Not the whitelist: upkeep, studies and advice, training kits and labs,
 * solar THERMAL (water heaters), rental, and something else that merely runs
 * on solar ("plantas potabilizadoras … operado mediante energía solar" is a
 * water purifier) — none is the equipment or plant the whitelist is for.
 * Rows like these keep the general rules.
 */
const NOT_NEW_ENERGY =
  /\bmantenimiento\b|\bmanutencao\b|\bconservacion\b|operacion y mantenimiento|\bo&m\b|\bestudios?\b|\bestudos?\b|consultori|interventori|asesori|assessori|supervision|supervisao|fiscalizacao|diagnostico|auditoria|capacitacion|capacitacao|formacion|\bcursos?\b|diplomado|treinamento|didactic|didatic|(?:kits?|materiale?s?) educativ|entrenador|modulos? de entrenamiento|kits? (?:de )?(?:laboratorio|practica|aprendizaje)|laboratorio de|calentador(?:es)? solar|terma(?:s)? solar|aquecedor(?:es)? solar|aquecimento solar|colector(?:es)? solar|coletor(?:es)? solar|\balquiler\b|\barrendamiento\b|\blocacao\b|(?:operad|accionad|alimentad|impulsad)[oa]s? (?:mediante|con|por) (?:energia )?(?:solar|fotovoltaica)/i;

function fold(text: string): string {
  return foldAccents(text);
}

/** Solar, wind, storage, hydrogen or EV charging equipment or plant — tagged 电力. */
export function isNewEnergyPower(text: string | undefined): boolean {
  if (!text) return false;
  const folded = fold(text);
  return NEW_ENERGY_POWER.test(folded) && !NOT_NEW_ENERGY.test(folded);
}

/** Anything on the new-energy whitelist, electric buses included. */
export function isNewEnergy(text: string | undefined): boolean {
  if (!text) return false;
  const folded = fold(text);
  return (NEW_ENERGY_POWER.test(folded) || NEW_ENERGY_VEHICLES.test(folded)) && !NOT_NEW_ENERGY.test(folded);
}
