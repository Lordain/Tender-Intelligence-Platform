/**
 * Portuguese exclusion rules, against the real Concorrência corpus captured
 * 2026-09-18 (100 rows; the titles below are verbatim, truncated only where
 * the terminal truncated them).
 *
 * Two properties are being tested, and the second matters more than the first:
 *
 *  1. The handful of routine contracts that reach a Concorrência are excluded.
 *  2. **Every real public work is kept.** An excluded tender is never written
 *     to Supabase, so a rule broader than its own name loses a real R$50M
 *     highway permanently and silently. The keep list below is most of this
 *     file for that reason — it is the regression net, not the nice-to-have.
 *
 * And one safety property that is structural rather than a matter of care:
 * these rules are gated on country === "Brazil", so a Mexican, Colombian or
 * Peruvian tender cannot reach them. The last block proves it.
 *
 * Usage: npm run test:relevance-pt
 */
import { classifyPortugueseExclusion, classifyPortugueseIndustries, isBrazil } from "@/lib/relevance-pt";
import { classifyRelevance, classifyStoredTender } from "@/lib/relevance";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

console.log("relevance-pt\n");

console.log("该排除的（都是真实语料里的 Concorrência）");
const EXCLUDE_CASES: [string, string][] = [
  ["城市垃圾清运", "PEC 106/2026 - CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A PRESTAÇÃO DOS SERVIÇOS DE COLETA, TRANSPORTE E DESTINAÇÃO DE RESÍDUOS SÓLIDOS DOMICILIARES, COMERCIAIS"],
  ["固废清运（另一种说法）", "RECOLHIMENTO DE RESIDUOS SOLIDOS NO MUNICIPIO DE JAGUARE/ ES"],
  ["市政清扫", "CONCORRÊNCIA ELETRÔNICA PARA CONTRATAÇÃO DE EMPRESA ESPECIALIZADA COM RESPONSABILIDADE TÉCNICA PARA PRESTAÇÃO DE SERVIÇO DE LIMPEZA URBANA E SANEAMENTO AMBIENTAL"],
  ["保洁（含专职人力）", "SOLICITAÇAO PARA CONTRATAÇÃO DE SERVIÇOS DE LIMPEZA, CONSERVAÇÃO E HIGIENIZAÇÃO COM DEDICAÇÃO EXCLUSIVA DE MÃO DE OBRA"],
  ["代发工资的银行特许经营", "Constitui objeto da presente licitação a cessão onerosa do direito à prestação dos serviços de processamento e pagamento da folha de pagamento do Município"],
  ["车辆维护", "CONTRATAÇÃO DE EMPRESA PARA MANUTENÇÃO DE VEÍCULOS DA FROTA MUNICIPAL"],
  ["房屋养护", "AQUISIÇÃO DE SERVIÇO DE MANUTENÇÃO E CONSERVAÇÃO DO BENS IMÓVEIS."],
  ["文艺演出", "APRESENTAÇÃO ARTÍSTICA MUSICAL"],
  ["培训报名", "Contratação de inscrição para a participação da Chefe de Gabinete no 4° Congresso Brasileiro de Mulheres de RPPS"],
  ["燃油供应", "Contratação de empresa especializada para fornecimento de combustíveis destinados ao abastecimento dos veículos"],
  ["药品采购", "Aquisição de medicamentos para atender demandas judiciais"],
  ["办公用品", "REGISTRO DE PREÇOS PARA AQUISIÇÃO EVENTUAL E FUTURA DE MATERIAL DE EXPEDIENTE E DIDÁTICO"],
];
for (const [label, title] of EXCLUDE_CASES) {
  const verdict = classifyPortugueseExclusion(title);
  check(label, verdict !== null, true);
}

console.log("\n绝不能被排除的 —— 真实工程，丢一条就是永久丢失");
const KEEP_CASES: [string, string][] = [
  ["州级公路铺装", " Contratação de Empresa (s) Especializada(s) para a execução do Componente Ambiental referente à obra de Implantação e Pavimentação da rodovia MT-020/251 do km 42 ao km 48."],
  ["公路实施与铺装", " Contratação de empresa de engenharia para execução da obra de implantação e pavimentação da Rodovia: MT-403"],
  ["学校改扩建", "CONTRATAÇÃO DE EMPRESAS DE ENGENHARIA PARA EXECUÇÃO DE OBRAS DE REFORMA, AMPLIAÇÃO E CONSTRUÇÃO EM UNIDADES EDUCACIONAIS DO MUNICÍPIO DE CAUCAIA/CE."],
  ["保障房建设", "Contratação de empresa especializada para realizar obra em regime de empreitada por preço global (materiais e mão de obra) para Construção de 14 Unidades Habitacionais"],
  ["16 座钢筋混凝土桥梁", "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A CONCLUSÃO DAS OBRAS REMANESCENTES DE 16 (DEZESSEIS) PONTES EM CONCRETO ARMADO"],
  ["箱涵排水", "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA EXECUÇÃO DE DRENAGEM PARA TRANSPOSIÇÃO DE TALVEGUES: BUEIRO QUÁDRUPLO CELULAR DE CONCRETO"],
  ["沥青罩面", "CAPEAMENTO ASFÁLTICO SOBRE PAVIMENTAÇAO POLIÉDRICA NA LINHA BOA ESPERANÇA"],
  ["配电网改造", "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A EXECUÇÃO DE OBRAS DE ADEQUAÇÃO DA REDE DE DISTRIBUIÇÃO DE ENERGIA ELÉTRICA"],
  ["警察局建设", "Construção da 10º Delegacia de Policia Civil em Fazendinha no Município de Macapá-AP"],
  ["设计施工总承包", "CONTRATAÇÃO, SOB O REGIME SEMI-INTEGRADO, DE EMPRESA ESPECIALIZADA PARA ELABORAÇÃO DE PROJETOS EXECUTIVOS E EXECUÇÃO DE OBRA DE CONSTRUÇÃO DE QUADRA POLIESPORTIVA"],
  ["勘察设计", "Contratação de empresa especializada para a elaboração dos projetos básico e executivo, realização de levantamentos topográficos, sondagens e ensaios geotécnicos"],
  ["市政基本卫生规划", "Contratação de empresa especializada para revisar, atualizar e consolidar o Plano Municipal de Saneamento Básico – PMSB de Acari/RN"],
  ["公园一期含市政配套", "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA EXECUÇÃO DA 01ª ETAPA DA CONSTRUÇÃO DO PARQUE DA ZONA NORTE, ABRANGENDO URBANISMO, PAISAGISMO E EDIFICAÇÕES COM INFRAESTRUTURA"],
  ["客运站改扩建", " EXECUÇÃO DA OBRA DE REFORMA E AMPLIAÇÃO DO TERMINAL RODOVIÁRIO OLÍMPIO VARGAS"],
  ["人工湖及环湖步道", "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA EM OBRAS E SERVIÇOS DE ENGENHARIA PARA A IMPLANTAÇÃO DE UM LAGO ARTIFICIAL DE USO PÚBLICO E DO RESPECTIVO CALÇADÃO PERIMETRAL"],
];
for (const [label, title] of KEEP_CASES) {
  check(label, classifyPortugueseExclusion(title), null);
}

console.log("\n带施工信号的养护合同要留下 —— 这就是那个护栏");
// Real (Crato/CE). The maintenance list would take it; ENGENHARIA and
// MELHORIA make it a works contract.
check(
  "球场养护与改善（含工程）",
  classifyPortugueseExclusion("CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA OS SERVIÇOS DE ENGENHARIA DE MANUTENÇÃO E MELHORIA DE QUADRAS, ARENINHAS E ARENAS PÚBLICAS DO MUNICÍPIO DE CRATO/CE"),
  null,
);
// A treatment plant carries the waste word; it is infrastructure, not a
// collection round.
check("固废处理厂不能被「清运」规则误伤", classifyPortugueseExclusion("CONSTRUÇÃO DE ESTAÇÃO DE TRATAMENTO DE RESÍDUOS SÓLIDOS"), null);

console.log("\n排除规则不能比它的名字更宽");
// The first version of the registration rule put the alternation around the
// whole pattern instead of inside the word, making the first branch a bare
// "inscrição". These pin that it cannot come back.
check("不动产登记号不是培训报名", classifyPortugueseExclusion("CONSTRUÇÃO DE MURO NO IMÓVEL DE INSCRIÇÃO IMOBILIÁRIA 12.345"), null);
check("单独一个 inscrição 不触发", classifyPortugueseExclusion("Reforma da sede, conforme inscrição no cadastro municipal"), null);
// Likewise "mão de obra" must not read as a public work.
check("「人工」不算工程信号 —— 保洁合同照排除", classifyPortugueseExclusion("PRESTAÇÃO DE SERVIÇOS DE LIMPEZA COM DEDICAÇÃO EXCLUSIVA DE MÃO DE OBRA") !== null, true);
check("「材料与人工」的真工程照留", classifyPortugueseExclusion("empreitada por preço global (materiais e mão de obra) para Construção de 14 Unidades Habitacionais"), null);

console.log("\n行业标签 —— 葡语路桥水电词，西语规则里一个都没有");
const INDUSTRY_CASES: [string, string, string][] = [
  ["州级公路", " obra de Implantação e Pavimentação da rodovia MT-020/251 do km 42 ao km 48.", "transportation"],
  ["石块铺装", "SERVIÇOS DE PAVIMENTAÇÃO EM PARALELEPÍPEDOS GRANÍTICOS NAS RUAS", "transportation"],
  ["六角砖铺装", "PAVIMENTAÇAO DE VIAS PÚBLICAS EM BLOQUETE SEXTAVADO DE 25x25(cm)", "transportation"],
  ["客运站", "REFORMA E AMPLIAÇÃO DO TERMINAL RODOVIÁRIO OLÍMPIO VARGAS", "transportation"],
  ["箱涵排水", "EXECUÇÃO DE DRENAGEM PARA TRANSPOSIÇÃO DE TALVEGUES: BUEIRO QUÁDRUPLO CELULAR DE CONCRETO", "water"],
  ["市政基本卫生", "revisar, atualizar e consolidar o Plano Municipal de Saneamento Básico", "water"],
  ["饮用水处理", "CONTROLE, MONITORAMENTO E TRATAMENTO DE ÁGUA PARA CONSUMO HUMANO NOS RESERVATÓRIOS", "water"],
  ["配电网", "OBRAS DE ADEQUAÇÃO DA REDE DE DISTRIBUIÇÃO DE ENERGIA ELÉTRICA NA LINHA SÃO LUIZ", "power"],
  ["照明设计", "elaboração dos Projetos Elétricos e Luminotécnicos para o Parque Ciliar", "power"],
  ["房建", "CONSTRUÇÃO DE UM CRAS NO MUNICÍPIO DE ITAITINGA/CE", "construction"],
  ["光纤专线", "prestação de serviço continuado de conexão dedicada à Internet, por fibra óptica", "ict_telecom"],
];
for (const [label, title, expected] of INDUSTRY_CASES) {
  check(label, classifyPortugueseIndustries(title).includes(expected as never), true);
}
check("没命中就返回空数组，不是 general", classifyPortugueseIndustries("APRESENTAÇÃO ARTÍSTICA MUSICAL"), []);

console.log("\n标签合并 —— 走的是 classifyStoredTender 这条真实路径");
const road = classifyStoredTender({
  title: " Contratação de empresa de engenharia para execução da obra de implantação e pavimentação da Rodovia: MT-403",
  summary: "",
  buyer: "SECRETARIA DE ESTADO DE INFRAESTRUTURA E LOGISTICA DE MATO GROSSO",
  country: "Brazil",
  procedureType: "Concorrência - Eletrônica",
  governmentLevel: "state",
  scopeType: "works",
  estimatedValue: 7_494_680.99,
  currency: "BRL",
  sourceName: "PNCP",
});
check("巴西公路同时拿到 transportation 和 construction", [road.industries.includes("transportation"), road.industries.includes("construction")], [true, true]);
check("有真标签时不再残留 general", road.industries.includes("general"), false);
// R$7,494,680.99 at 1 USD = 5.16 BRL is US$1.45M — above MIN_VALUE_USD (800k)
// and below SIGNIFICANT_VALUE_USD (3M), so "standard". This expectation was
// written as "significant" first, which was simply wrong arithmetic on my
// part; it is pinned here because it is also the answer to "where will
// Brazilian tenders land", and the answer is that a typical municipal works
// contract lands in 常规, not 中型. Note this is the tier AFTER commit
// 3568cf1 removed the clause that promoted any works contract above the
// minimum — before that, this row would have been significant.
check("R$749 万 ≈ US$145 万 → 常规（standard），不是中型", road.relevance.tier, "standard");
const mexicanRoad = classifyStoredTender({
  title: "Construcción y pavimentación de la carretera estatal",
  summary: "",
  buyer: "Secretaría de Infraestructura",
  country: "Mexico",
  procedureType: "Licitación Pública",
  governmentLevel: "state",
  scopeType: "works",
  estimatedValue: 7_000_000,
  currency: "USD",
  sourceName: "test",
});
check("墨西哥的路照常打标签，没被葡语这条影响", mexicanRoad.industries.includes("transportation"), true);

console.log("\n国家门禁 —— 这些规则碰不到墨西哥／哥伦比亚／秘鲁");
check("isBrazil 只认 Brazil", [isBrazil("Brazil"), isBrazil("Mexico"), isBrazil(undefined)], [true, false, false]);
const spanishCleaning = {
  title: "PRESTAÇÃO DE SERVIÇO DE LIMPEZA URBANA",
  industries: [] as string[],
  scopeType: "services" as const,
  estimatedValue: 5_000_000,
  currency: "USD",
  governmentLevel: "municipal" as const,
  procedureType: "Concorrência - Eletrônica",
  sourceName: "test",
};
check("同一条文本，country=Brazil 被排除", classifyRelevance({ ...spanishCleaning, country: "Brazil" }).tier, "excluded");
check("country=Mexico 时这条葡语规则不生效", classifyRelevance({ ...spanishCleaning, country: "Mexico" }).tier !== "excluded", true);

console.log();

// ---------------------------------------------------------------------------
// The five rows the first Brazil dry run excluded for "no industry, no amount",
// verbatim from exports/excluded-brazil-pncp-dryrun-2026-09-18.csv, with the
// user's own verdict on each (2026-09-18). All five have NO published amount,
// which is why they reached that gate at all — so each is decided purely on
// its words, which is exactly what these rules are.
// ---------------------------------------------------------------------------

function brazilTender(title: string) {
  return classifyStoredTender({
    title,
    summary: "",
    buyer: "PREFEITURA MUNICIPAL",
    country: "Brazil",
    procedureType: "Concorr\u00eancia - Eletr\u00f4nica",
    governmentLevel: "municipal",
    scopeType: "works",
    sourceName: "PNCP",
  });
}

// KEEP. A multi-lot sports complex: gymnasium, pool, park revitalisation and a
// new secretariat building. The row that proved the industry gate was deaf to
// Portuguese.
const poliesportivo = brazilTender(
  "Edital Retificado (Lote 01) - Constru\u00e7\u00e3o de Complexo Poliesportivo, compreendendo a Constru\u00e7\u00e3o do Gin\u00e1sio Esportivo, inclu\u00eddo a Reforma da Piscina Desportiva (LOTE 1), Reforma e Revitaliza\u00e7\u00e3o do Parque Municipal (Parque Ara\u00e7ariguama) (LOTE 2) e a Constru\u00e7\u00e3o da Nova Sede da Secretaria Municipal de Esportes (LOTE 3",
);
check("\u4f53\u80b2\u7efc\u5408\u4f53\u4e0d\u518d\u88ab\u6392\u9664", poliesportivo.relevance.tier !== "excluded", true);
check("\u4f53\u80b2\u7efc\u5408\u4f53\u62ff\u5230 construction \u6807\u7b7e", poliesportivo.industries.includes("construction"), true);

// KEEP. The comma after "obras" is the entire reason this one was lost: the
// old pattern wanted "obras de amplia\u00e7\u00e3o" and the real title says
// "execu\u00e7\u00e3o de obras, referente \u00e0 amplia\u00e7\u00e3o".
const escola = brazilTender(
  "Contrata\u00e7\u00e3o de empresa habilitada para a execu\u00e7\u00e3o de obras, referente \u00e0 amplia\u00e7\u00e3o da Escola Coronel Francisco Ferreira de Carvalho - Rua Coronel S\u00e9rgio Amaral - Oliveira Fortes, destinados ao atendimento de alunos matriculados em escolas da rede municipal de ensino",
);
check("\u5b66\u6821\u6269\u5efa\u4e0d\u518d\u88ab\u6392\u9664", escola.relevance.tier !== "excluded", true);
check("\u5b66\u6821\u6269\u5efa\u62ff\u5230 construction \u6807\u7b7e", escola.industries.includes("construction"), true);

// EXCLUDE. Open-air pitches, a playground and a walking track. Carries
// "CONSTRU\u00c7\u00c3O", so nothing above may be allowed to rescue it.
const campo = brazilTender(
  "CONSTRU\u00c7\u00c3O DE CAMPO DE FUTEBOL COM GRAMA SINT\u00c9TICA, MEIA QUADRA DE BASQUETE, PARQUINHO INFANTIL E PISTA DE CAMINHADA (TIPO B) NO MUNIC\u00cdPIO DE COQUEIRO SECO/AL",
);
check("\u5c0f\u578b\u5ba4\u5916\u8fd0\u52a8\u8bbe\u65bd\u4ecd\u88ab\u6392\u9664", campo.relevance.tier, "excluded");
// The reason must be the new one. Falling through to the shared keyword text
// would tell a reviewer "\u65e5\u5e38\u6027\u670d\u52a1\u91c7\u8d2d" about a construction contract — the
// exact failure reasonFor's own comment records paying for once.
check("\u6392\u9664\u7406\u7531\u8bf4\u7684\u662f\u8fd9\u6761\u89c4\u5219\u672c\u8eab", campo.relevance.reason.zh.includes("\u5ba4\u5916\u8fd0\u52a8"), true);

// EXCLUDE (both). Advertising agency contracts.
const publicidade: [string, string][] = [
  ["\u5c0f\u5199", "O objeto da presente Concorr\u00eancia \u00e9 a contrata\u00e7\u00e3o de servi\u00e7os de publicidade prestados por interm\u00e9dio de ag\u00eancia de propaganda, compreendendo o conjunto atividades realizadas integradamente que tenham por objetivo o estudo, o planejamento, a conceitua\u00e7\u00e3o, a concep\u00e7\u00e3o, a cria\u00e7\u00e3o, a execu\u00e7\u00e3o interna, a intermedia\u00e7\u00e3o e supervis\u00e3o da execu\u00e7\u00e3o externa e a distribui\u00e7\u00e3o de a\u00e7\u00f5es publicit\u00e1rias junto a p\u00fablicos de interesse."],
  ["\u5168\u5927\u5199", "CONTRATA\u00c7\u00c3O DE SERVI\u00c7O DE PUBLICIDADE, PRESTADO POR INTERM\u00c9DIO DE UMA AG\u00caNCIA DE PROPAGANDA, COMPREENDENDO O CONJUNTO DE ATIVIDADES REALIZADAS INTEGRADAMENTE QUE TENHAM POR OBJETIVO O ESTUDO, O PLANEJAMENTO, A CONCEITUA\u00c7\u00c3O, A CONCEP\u00c7\u00c3O, A CRIA\u00c7\u00c3O, A EXECU\u00c7\u00c3O INTERNA, A INTERMEDIA\u00c7\u00c3O E A SUPERVIS\u00c3O DA EXECU\u00c7\u00c3O EXTERNA E A DISTRIBUI\u00c7\u00c3O DE PUBLICIDADE AOS VE\u00cdCULOS E DEMAIS MEIOS DE DIVULGA\u00c7\u00c3O"],
];
for (const [label, title] of publicidade) {
  check(`\u5e7f\u544a\u4ee3\u7406\uff08${label}\uff09\u4ecd\u88ab\u6392\u9664`, brazilTender(title).relevance.tier, "excluded");
}

// Over-breadth pins for the sports rule. A municipal PARQUE is not a
// PARQUINHO, and a covered court is a building.
check(
  "\u300c\u516c\u56ed\u6539\u9020\u300d\u4e0d\u88ab\u5c0f\u578b\u8fd0\u52a8\u8bbe\u65bd\u89c4\u5219\u6253\u6389",
  brazilTender("Reforma e revitaliza\u00e7\u00e3o do Parque Municipal com pavimenta\u00e7\u00e3o de passeios").relevance.tier !== "excluded",
  true,
);
check(
  "\u300c\u6709\u9876\u68da\u7403\u573a\u300d\u4e0d\u88ab\u5c0f\u578b\u8fd0\u52a8\u8bbe\u65bd\u89c4\u5219\u6253\u6389",
  brazilTender("Constru\u00e7\u00e3o de quadra coberta e pista de caminhada na Escola Municipal").relevance.tier !== "excluded",
  true,
);

if (failures > 0) {
  console.log(`${failures} 项没过。`);
  process.exit(1);
}
console.log("全部通过。");
