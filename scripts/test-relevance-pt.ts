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
  tenderNumber: undefined,
  governmentLevel: "state",
  scopeType: "works",
  estimatedValue: 7_494_680.99,
  currency: "BRL",
  sourceName: "PNCP",
});
check("巴西公路同时拿到 transportation 和 construction", [road.industries.includes("transportation"), road.industries.includes("construction")], [true, true]);
check("有真标签时不再残留 general", road.industries.includes("general"), false);
// R$7,494,680.99 at 1 USD = 5.16 BRL is US$1.45M, and as of 2026-09-18 that
// is BELOW Brazil's own floor of $2,000,000 — so the tender this entire
// connector was built against is now excluded from the Brazilian feed.
//
// That is the clearest statement of what the per-country floor does, which is
// why it is pinned rather than quietly deleted. The row was correctly read,
// correctly valued and correctly tagged; it is simply a routine municipal
// road contract, and at ~39 of those a day the user asked for ~20. It stays
// here as the reference for "how big is big enough in Brazil".
check("R$749 万 ≈ US$145 万 → 低于巴西 200 万门槛，被排除", road.relevance.tier, "excluded");
check("排除理由说的是金额门槛", road.relevance.reason.zh.includes("2,000,000"), true);

// The floor must not leak. Same amount, same words, a different country: Peru
// keeps the platform default of $800,000, so this one stays in. 319 Spanish
// fixtures in test:relevance cover this from the other side; this is the
// direct statement of it.
const peruvianRoad = classifyStoredTender({
  title: "Mejoramiento de la carretera departamental",
  summary: "",
  buyer: "GOBIERNO REGIONAL",
  country: "Peru",
  procedureType: "Licitación Pública",
  tenderNumber: undefined,
  governmentLevel: "state",
  scopeType: "works",
  estimatedValue: 1_450_000,
  currency: "USD",
  sourceName: "OECE",
});
check("同样金额在秘鲁不受巴西门槛影响", peruvianRoad.relevance.tier !== "excluded", true);
const mexicanRoad = classifyStoredTender({
  title: "Construcción y pavimentación de la carretera estatal",
  summary: "",
  buyer: "Secretaría de Infraestructura",
  country: "Mexico",
  procedureType: "Licitación Pública",
  tenderNumber: undefined,
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
  tenderNumber: undefined,
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
    tenderNumber: undefined,
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
//
// Both of these named an "Escola Municipal" as their innocent site until
// 2026-09-19, when the user made village schools an exclusion class of their
// own (see PT_SMALL_FACILITY_LIST). The site was incidental to what each case
// pins, so the site changed and the assertion did not — and the school
// version is now asserted separately, below, as an exclusion.
check(
  "\u300c\u516c\u56ed\u6539\u9020\u300d\u4e0d\u88ab\u5c0f\u578b\u8fd0\u52a8\u8bbe\u65bd\u89c4\u5219\u6253\u6389",
  brazilTender("Reforma e revitaliza\u00e7\u00e3o do Parque Municipal com pavimenta\u00e7\u00e3o de passeios").relevance.tier !== "excluded",
  true,
);
check(
  "\u300c\u6709\u9876\u68da\u7403\u573a\u300d\u4e0d\u88ab\u5c0f\u578b\u8fd0\u52a8\u8bbe\u65bd\u89c4\u5219\u6253\u6389",
  brazilTender("Constru\u00e7\u00e3o de quadra coberta e pista de caminhada no Centro de Conven\u00e7\u00f5es Municipal").relevance.tier !== "excluded",
  true,
);

// The first real Brazil write (2026-09-18, 20 kept / 17 written). The user
// read every kept row and marked these four 排除. Each is a service contract
// well over the US$2,000,000 floor — federal and state-owned buyers sign them
// routinely — which is exactly why scale could not catch them.
const REVIEWED_AND_REJECTED: [string, string][] = [
  [
    "EMBRATUR 公关传播",
    "Contrata\u00e7\u00e3o de empresa prestadora de servi\u00e7os de Comunica\u00e7\u00e3o Corporativa e Rela\u00e7\u00f5es P\u00fablicas em Territ\u00f3rio Nacional para a Ag\u00eancia Brasileira de Promo\u00e7\u00e3o Internacional do Turismo - EMBRATUR",
  ],
  [
    "CAIXA 押运与贵重物品保管",
    "PRESTA\u00c7\u00c3O DE SERVI\u00c7OS COMUNS DE TRANSPORTE, TRATAMENTO E CUST\u00d3DIA DE VALORES PARA UNIDADES CAIXA, UNIDADES LOT\u00c9RICAS (UL), CORRESPONDENTES CAIXA AQUI (CCA) E CLIENTES, NO \u00c2MBITO DO ESTADO DA BAHIA, REGI\u00c3O DE SALVADOR",
  ],
  [
    "CAIXA 模块化网点租赁与运营",
    "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA PRESTA\u00c7\u00c3O DE SERVI\u00c7O CONT\u00cdNUO DE DISPONIBILIZA\u00c7\u00c3O, LOCA\u00c7\u00c3O E OPERA\u00c7\u00c3O DE UNIDADES DE ATENDIMENTO CONCEBIDAS EM SOLU\u00c7\u00c3O CONSTRUTIVA TIPO OFF SITE COMPOSTAS POR M\u00d3DULOS",
  ],
  [
    "Gravata\u00ed 急诊单元运营外包",
    "Contrata\u00e7\u00e3o de entidade para a gest\u00e3o das Unidades de Pronto Atendimento",
  ],
];
for (const [label, title] of REVIEWED_AND_REJECTED) {
  check(`${label} 被排除`, brazilTender(title).relevance.tier, "excluded");
}

// The second review round (2026-09-20). Six more titles the user read on the
// live site and marked 排除, each one a shape that walked past the rules
// written in the first round.
const REVIEWED_AND_REJECTED_2: [string, string][] = [
  [
    // The plural. `\brua\s` matched "na Rua X" and missed "das Ruas X, Y, Z"
    // — so the SIX-street version of a job excluded at one street survived.
    "六条街的连锁砖铺装",
    "Seleção e contratação de empresa do ramo de engenharia e/ou construção civil, para a escolha da proposta mais vantajosa, em regime de empreitada global (material e mão-de-obra especializada) para a Execução de pavimentação intertravada com blocos sextavados de concreto em trechos das Ruas Beira Mar, Forquilhinha, Francisco Pedro Vicente, Gonçalves Marques Teixeira, Hermes Pavei de Lucca e Lindomar Bernardo.",
  ],
  [
    // 广场/公园绿化。The old rule wanted `praça pública`; a real one is called
    // after a tree.
    "广场公园绿化与城市家具",
    "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA NA EXECUÇÃO DE OBRAS COMUNS DE ENGENHARIA DE URBANIZAÇÃO, REVITALIZAÇÃO E PAISAGISMO DE PRAÇAS, PARQUES E CANTEIROS PÚBLICOS DO MUNICÍPIO DE CACHOEIRA DOURADA, COMPREENDENDO SERVIÇOS DE PAISAGISMO, INSTALAÇÃO DE MOBILIÁRIO URBANO E EXECUÇÃO DE PISOS, PASSEIOS E MEIOS FIOS.",
  ],
  [
    "新建一座广场",
    "CONTRATACAO DE EMPRESA ESPECIALIZADA PARA EXECUCAO DE OBRA DE ENGENHARIA CONSISTENTE NA CONSTRUCAO DA PRACA DA FIGUEIRA NA AV. EUCLIDES DA CUNHA S N EM EUCLIDES DA CUNHA PAULISTA.",
  ],
  [
    // 边坡防护。The list knew `contenção de encosta`; Brazilian engineering
    // says `talude` just as often, and names the method rather than the slope.
    "边坡防护与挡土墙",
    "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA DE ENGENHARIA PARA A ELABORAÇÃO DE PROJETO EXECUTIVO E A EXECUÇÃO COMPLETA DAS OBRAS DE CONTENÇÃO DE TALUDE E CALÇADA DE PASSEIO E PAVIMENTO EM VIA PÚBLICA, ESTABILIZAÇÃO EM SOLO GRAMPEADO (CONCRETO PROJETADO E VERDE), MURO DE GABIÃO, MURO DE ARRIMO, SISTEMA DE DRENAGEM, PAISAGISMO E URBANIZAÇÃO E LEVANTAMENTO CADASTRAL DE ÁREAS PERMEÁVEIS NATURAIS E ELEMENTOS DRENANTES,",
  ],
  [
    // 市政路网。Mentions a `rodovia`, which is why PT_HIGHWAY_MARKER could not
    // be the gate — the highway is what the work crosses, not what it builds.
    "会展中心周边市政路网改善",
    "CONTRATAÇÃO DE EMPRESA OU CONSÓRCIO DE EMPRESAS ESPECIALIZADAS EM ENGENHARIA PARA EXECUÇÃO DAS OBRAS E SERVIÇOS DE MELHORIA DO SISTEMA VIÁRIO NO ENTORNO DO SÃO PAULO EXPO, COM IMPLANTAÇÃO DE NOVOS ACESSOS VIÁRIOS, PASSAGEM SUPERIOR SOBRE A RODOVIA DOS IMIGRANTES E CICLOPASSARELA, NA REGIÃO DO JABAQUARA, SÃO PAULO/SP",
  ],
];
for (const [label, title] of REVIEWED_AND_REJECTED_2) {
  check(`${label} 被排除`, brazilTender(title).relevance.tier, "excluded");
}

// The sixth is a TITLE rule, not a haystack rule — end-anchored, so it has to
// be asserted through the title field rather than through the joined text.
check(
  "「工程与工程服务」这种没有对象的标题被排除",
  brazilTender("OBRAS E SERVIÇOS DE ENGENHARIA").relevance.tier,
  "excluded",
);

// Over-breadth pins for the six above. Each one is a real work that shares a
// word with a rule and must survive it.
const ROUND_2_KEEPS: [string, string][] = [
  // The two patterns deliberately NOT added: `canteiro central` is the median
  // of a dual carriageway and `meio-fio` its kerb, so a rule built on either
  // would have excluded the largest road work in the corpus on the word.
  ["双向四车道复线（带中央分隔带和路缘石）", "Duplicação da Rodovia BR-101 com execução de canteiro central, meio-fio e drenagem, trecho de 42 km"],
  // `praça` as an ADDRESS, not as the object. The verb governs the terminal.
  ["以广场为地址的客运站工程", "Construção do Terminal Rodoviário Municipal e do viaduto de acesso, na Praça da Bandeira"],
  // The no-object title is end-anchored: the identical words opening a real
  // object statement describe a real work.
  ["同样开头但写清了对象的工程", "OBRAS E SERVIÇOS DE ENGENHARIA PARA CONSTRUÇÃO DA PONTE SOBRE O RIO PARANÁ, COM 1.200 METROS DE EXTENSÃO"],
  // `sistema viário` is required to be the object. A highway duplication says
  // something else entirely.
  ["州道复线（不含市政路网措辞）", "Contratação para duplicação e restauração da rodovia MG-050, incluindo obras de arte especiais"],
  // `paisagismo` as one line item among many in genuine heavy civil works.
  ["含绿化条目的污水处理厂", "Construção da Estação de Tratamento de Esgoto do município, com rede coletora tronco, urbanização e paisagismo da área externa"],
];
for (const [label, title] of ROUND_2_KEEPS) {
  check(`${label} 不能被排除`, brazilTender(title).relevance.tier !== "excluded", true);
}

// Over-breadth pins, one per rule above. Each is the nearest thing that must
// NOT be lost — an excluded row is never written to Supabase, so a rule that
// reaches one step too far deletes real work permanently and in silence.
//
// Asserted against classifyPortugueseExclusion rather than the final tier,
// deliberately: the tier is decided by every rule in lib/relevance.ts, and two
// of these three titles are excluded by a SPANISH rule that predates this
// file (verified 2026-09-18 by running them against the previous commit).
// Pinning the tier here would silently turn this into a test of that rule
// instead of the one it is named after.
const PT_RULE_MUST_NOT_FIRE: [string, string][] = [
  // Building a UPA is construction; running one is not. Same three words.
  ["建 UPA 不是运营 UPA", "CONTRATA\u00c7\u00c3O DE EMPRESA PARA CONSTRU\u00c7\u00c3O DA UNIDADE DE PRONTO ATENDIMENTO - UPA NO MUNIC\u00cdPIO"],
  // Plant hire inside a works package carries locação AND operação, which is
  // the exact shape of the CAIXA leasing rule — the works signal is what
  // separates them.
  ["工程包里的设备租赁", "LOCA\u00c7\u00c3O DE USINA DE ASFALTO COM OPERA\u00c7\u00c3O PARA EXECU\u00c7\u00c3O DE OBRA DE PAVIMENTA\u00c7\u00c3O"],
  // `valores` is also the ordinary word for "amounts".
  ["调价文里的 valores", "REEQUIL\u00cdBRIO ECON\u00d4MICO-FINANCEIRO E REVIS\u00c3O DE VALORES DO CONTRATO DE OBRA"],
];
for (const [label, title] of PT_RULE_MUST_NOT_FIRE) {
  check(`${label}：葡语规则不开火`, classifyPortugueseExclusion(title), null);
}
// This one must also survive the whole classifier, not just this file's rules.
check(
  "建 UPA 端到端保留",
  brazilTender(PT_RULE_MUST_NOT_FIRE[0][1]).relevance.tier !== "excluded",
  true,
);

// O&M on finished infrastructure. Real row, reviewed by the user 2026-09-18
// and marked 维护类: the works guard spared it because the title contains
// `OBRAS` — as the object being maintained, not as work to be built.
const RENASCE =
  "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA PRESTA\u00c7\u00c3O DE SERVI\u00c7OS CONTINUADOS DE OPERA\u00c7\u00c3O E MANUTEN\u00c7\u00c3O DOS SISTEMAS E OBRAS DO PROJETO RENASCE SALGADINHO.";
check("运维合同被判为维护类", classifyPortugueseExclusion(RENASCE), "maintenance_only");
check("运维合同端到端被排除", brazilTender(RENASCE).relevance.tier, "excluded");

// The control that decides whether that rule is safe. A DBO concession is the
// largest thing Brazil tenders; the same two upkeep words appear, and a build
// verb is the only thing separating them.
check(
  "「建设、运营与维护」是 DBO，不能排除",
  classifyPortugueseExclusion(
    "CONCESS\u00c3O PARA CONSTRU\u00c7\u00c3O, OPERA\u00c7\u00c3O E MANUTEN\u00c7\u00c3O DA ESTA\u00c7\u00c3O DE TRATAMENTO DE ESGOTO",
  ),
  null,
);
// The row this file's works guard was written for must still survive: its
// maintenance word is paired with 改善, not with 运营.
check(
  "「维护与改善球场」仍然保留",
  classifyPortugueseExclusion(
    "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA OS SERVI\u00c7OS DE ENGENHARIA DE MANUTEN\u00c7\u00c3O E MELHORIA DE QUADRAS, ARENINHAS E ARENAS P\u00daBLICAS",
  ),
  null,
);

// Three more reviewed by the user 2026-09-18. All three carry a works word
// that the guard reads as "this is a real work" — obras, obras rodoviárias,
// engenharia — while what is being bought is a service ABOUT those works.
const SEINFRA =
  "O objeto da presente licita\u00e7\u00e3o \u00e9 a contrata\u00e7\u00e3o de empresa de engenharia especializada para a elabora\u00e7\u00e3o de estudos e projetos, gerenciamento, supervis\u00e3o e apoio \u00e0 fiscaliza\u00e7\u00e3o de obras de responsabilidade da Secretaria de Estado da Infraestrutura \u2013 SEINFRA/AL, conforme condi\u00e7\u00f5es, quantidades e exig\u00eancias estabelecidas neste Edital e seus anexos.";
const AGETO =
  "Contrata\u00e7\u00e3o de empresa especializada para presta\u00e7\u00e3o de servi\u00e7os t\u00e9cnicos de gerenciamento e assessoria t\u00e9cnica, para projetos e obras rodovi\u00e1rias na malha rodovi\u00e1ria do estado do Tocantins, sob responsabilidade da Ag\u00eancia de Transportes, Obras e Infraestrutura - AGETO.";
const PINTURA =
  "Registro de Pre\u00e7os para servi\u00e7os comuns de engenharia destinados \u00e0 execu\u00e7\u00e3o de servi\u00e7os de pintura predial interna e externa.";

check("SEINFRA 监理咨询判为咨询类", classifyPortugueseExclusion(SEINFRA), "consulting");
check("AGETO 公路项目管理判为咨询类", classifyPortugueseExclusion(AGETO), "consulting");
check("建筑涂装被排除", classifyPortugueseExclusion(PINTURA), "keyword");
for (const [label, title] of [["SEINFRA", SEINFRA], ["AGETO", AGETO], ["\u5efa\u7b51\u6d82\u88c5", PINTURA]] as [string, string][]) {
  check(`${label} 端到端被排除`, brazilTender(title).relevance.tier, "excluded");
}
// The reason is not cosmetic: the excluded CSV is reviewed BY reason, and a
// supervision contract filed under 日常性服务 is filed where nobody checking
// the consulting rules would look.
check("咨询类用的是咨询理由，不是日常服务", brazilTender(SEINFRA).relevance.reason.zh.includes("\u7eaf\u54a8\u8be2"), true);

// Over-breadth pins. Each is a genuine work carrying the same trigger word;
// the build verb is the only thing separating them.
const SUPERVISION_MUST_SURVIVE: [string, string][] = [
  ["改扩建学校（标书里提到监理）", "REFORMA E AMPLIA\u00c7\u00c3O DA ESCOLA MUNICIPAL, COM ACOMPANHAMENTO E FISCALIZA\u00c7\u00c3O DA SECRETARIA DE OBRAS"],
  ["铺装工程（提到项目管理）", "EXECU\u00c7\u00c3O DE OBRA DE PAVIMENTA\u00c7\u00c3O ASF\u00c1LTICA COM GERENCIAMENTO DA FISCALIZA\u00c7\u00c3O MUNICIPAL"],
  ["新建学校含内外墙涂装", "CONSTRU\u00c7\u00c3O DE ESCOLA MUNICIPAL INCLUINDO PINTURA INTERNA E EXTERNA"],
];
for (const [label, title] of SUPERVISION_MUST_SURVIVE) {
  check(`${label}：葡语规则不开火`, classifyPortugueseExclusion(title), null);
}
// Road marking is a real highway work item and shares the word `pintura`.
check(
  "\u9053\u8def\u6807\u7ebf\u4e0d\u53d7\u5f71\u54cd",
  classifyPortugueseExclusion("EXECU\u00c7\u00c3O DE SINALIZA\u00c7\u00c3O HORIZONTAL COM PINTURA DE FAIXAS NA RODOVIA ESTADUAL"),
  null,
);

// A title whose entire object text is "Obras comuns" — Lei 14.133's own
// category name, which says nothing about what is being built. It came out
// 常规项目 with a construction tag.
check("「Obras comuns」按「信息过少」排除", brazilTender("Obras comuns").relevance.tier, "excluded");
check(
  "「Obras comuns」的理由是信息过少，不是关键词",
  brazilTender("Obras comuns").relevance.reason.zh.includes("\u6ca1\u6709\u4efb\u4f55\u63cf\u8ff0"),
  true,
);
// The same two words, followed by something that does say what it is.
check(
  "「Obras comuns de reforma da Escola」仍然保留",
  brazilTender("Obras comuns de reforma da Esta\u00e7\u00e3o de Tratamento de Esgoto do munic\u00edpio").relevance.tier !== "excluded",
  true,
);

// The row that exposed the ASCII word-boundary bug: `\br[íi]o\b` matched the
// "rio" inside "Território", so a public-relations contract was tagged as
// water infrastructure. See lib/text-fold.ts and npm run test:text-fold.
check(
  "EMBRATUR 不再被打上水工程标签",
  brazilTender(REVIEWED_AND_REJECTED[0][1]).industries.includes("water"),
  false,
);


// ─────────────────────────────────────────────────────────────────────────
// 小型工程 (2026-09-19). The user reviewed a day of real rows and named the
// class: 小学校(幼儿园、小型小学、乡村学校、社区学校、托儿所、学前教育)、
// 小体育场、小广场、社区广场、社区体育场、社区道路、小型道路、社区医院、
// 农村医院 —— 这些中国公司(即使已经在本地有实体了)一般不会参加.
//
// Every title below is verbatim from that review. Before the rule, the
// existing logic excluded 0 of 23 — each one carries a real works word, and
// PT_REAL_WORKS_SIGNAL is a guard that returns "keep" the moment it sees one.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n\u5c0f\u578b\u5de5\u7a0b\uff08\u7528\u6237 2026-09-19 \u9010\u6761\u5ba1\u8fc7\u7684\u771f\u5b9e\u6807\u9898\uff09");
const SMALL_WORKS_CASES: [string, string][] = [
  ["\u5e7c\u513f\u56ed\uff08creche\uff09", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA EXECU\u00c7\u00c3O DA OBRA DE CONSTRU\u00c7\u00c3O DE CRECHE TIPO 2, PADR\u00c3O FNDE, NO BAIRRO DE TIBIRI, NO MUNIC\u00cdPIO DE SANTA RITA, PB."],
  ["\u5e7c\u513f\u56ed\uff08CMEI\uff09", "contrata\u00e7\u00e3o de empresa especializada para execu\u00e7\u00e3o de muro e requalifica\u00e7\u00e3o da fachada do CMEI GOTINHAS DO SABER"],
  ["\u5b66\u524d\u73ed\u98df\u5802", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA EM OBRAS E SERVI\u00c7OS DE ENGENHARIA PARA EXECU\u00c7\u00c3O DE COBERTURA EM ESTRUTURA MET\u00c1LICA, DESTINADA \u00c0 IMPLANTA\u00c7\u00c3O DE REFEIT\u00d3RIO PARA ATENDIMENTO DAS TURMAS DO PR\u00c9 I, COM \u00c1REA APROXIMADA DE 93,00 M\u00b2."],
  ["\u4e61\u6751\u5c0f\u5b66\u7403\u573a", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA A CONSTRU\u00c7\u00c3O DE UMA QUADRA ESPORTIVA NA ESCOLA MUNICIPAL S\u00c3O BENTO, POVOADO GAMELEIRA NA ZONA RURAL"],
  ["\u5e02\u7acb\u5b66\u6821\u6539\u6269\u5efa", "Contrata\u00e7\u00e3o de empresa especializada no ramo de engenharia para reforma e amplia\u00e7\u00e3o da Escola Municipal Professora Z\u00e9lia de Barros Carneiro, bairro Aeroporto - Muria\u00e9 - MG"],
  ["\u793e\u533a\u536b\u751f\u7ad9", "Contrata\u00e7\u00e3o de empresa especializada para execu\u00e7\u00e3o da reforma e amplia\u00e7\u00e3o da Unidade B\u00e1sica de Sa\u00fade Vila Maria"],
  ["\u793e\u533a\u7403\u573a\uff0b\u5e7f\u573a", "Contrata\u00e7\u00e3o de empresa especializada para execu\u00e7\u00e3o de obra de engenharia destinada \u00e0 constru\u00e7\u00e3o de espa\u00e7o esportivo, incluindo campo society, pra\u00e7a de conviv\u00eancia, quiosque de apoio"],
  ["\u5dde\u7ea7\u5c0f\u7403\u573a\u9879\u76ee", "Constru\u00e7\u00e3o das obras do Programa MEU CAMPINHO no Lago IV \u2013 Londrina/PR"],
  ["\u8857\u9053\u6cbe\u9752", "Contrata\u00e7\u00e3o de empresa de engenharia para execu\u00e7\u00e3o de servi\u00e7os de recapeamento asf\u00e1ltico na Rua Renato Azeredo, bairro Gameleira, munic\u00edpio de Felixl\u00e2ndia/MG"],
  ["\u8857\u9053\u94fa\u88c5", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA EXECU\u00c7\u00c3O DE OBRA DE PAVIMENTA\u00c7\u00c3O ASF\u00c1LTICA DA RUA ALCIDES SERAFIM, BAIRRO SANGA FUNDA"],
  ["\u793e\u533a\u94fa\u88c5", "CONTRATACAO DE EMPRESA DO RAMO PARA EXECUCAO DE PAVIMENTACAO DO BAIRRO PORTAL DA ALVORADA I DO MUNICIPIO DE GUAPIRAMA"],
  ["\u5e26\u957f\u5ea6\u6570\u5b57\u7684\u8857\u9053", "Constitui objeto da presente licita\u00e7\u00e3o a contrata\u00e7\u00e3o de empresa especializada para pavimenta\u00e7\u00e3o asf\u00e1ltica Rua 558 \u2013 Osvaldo Lenzi, com extens\u00e3o de 114,00 metros, no Bairro Schroeder I"],
  ["\u4e61\u6751\u77f3\u5757\u8def", "CONTRATA\u00c7\u00c3O DE EMPRESA DE ENGENHARIA PARA PAVIMENTA\u00c7\u00c3O EM PARALELEP\u00cdPEDO DE 3.396,00 M\u00b2 NA ZONA RURAL NO MUNICIPIO DE BOA HORA \u2013 PI"],
  ["\u4e61\u9053", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA NA RECUPERA\u00c7\u00c3O E PAVIMENTA\u00c7\u00c3O EM PEDRA TOSCA COM REJUNTAMENTO DA ESTRADA VICINAL QUE LIGA A SEDE DE TIANGU\u00c1 AO DISTRITO DE OITICICAS"],
  ["\u8def\u9762\u517b\u62a4", "O objeto consiste na contrata\u00e7\u00e3o de empresa especializada para a execu\u00e7\u00e3o de servi\u00e7os de conserva\u00e7\u00e3o preventiva de pavimentos asf\u00e1lticos, Lote 112 do Programa Goi\u00e1s em Movimento"],
  ["\u8fb9\u5761\u6321\u5899", "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA EXECU\u00c7\u00c3O DE OBRA DE CONTEN\u00c7\u00c3O DE ENCOSTA, LOCALIZADA NA AVENIDA PERI PERI, NO MUNIC\u00cdPIO DE NIL\u00d3POLIS \u2013 RJ"],
  ["\u4e61\u6751\u4f9b\u6c34", "CONTRATA\u00c7\u00c3O SEMI-INTEGRADA DE EMPRESA ESPECIALIZADA DE ENGENHARIA PARA IMPLANTA\u00c7\u00c3O, AMPLIA\u00c7\u00c3O E REFORMA DE SISTEMAS DE ABASTECIMENTO DE \u00c1GUA EM \u00c1REA RURAL, LOCALIZADOS NO MUNIC\u00cdPIO DE MARITUBA/PA"],
  ["\u6d3b\u52a8\u516c\u56ed\u94fa\u88c5", "A presente licita\u00e7\u00e3o tem por objeto obras de pavimenta\u00e7\u00e3o em parte do Parque de Eventos At\u00edlio Sirote, no Munic\u00edpio de Atalaia/PR"],
];
for (const [label, title] of SMALL_WORKS_CASES) {
  check(label, brazilTender(title).relevance.tier, "excluded");
}

// OVER-BREADTH PINS. This is the half that matters: an excluded tender is
// never written, so a rule broader than its own name loses a real contract
// permanently and silently. Every one of these carries a word the rules above
// key on, and every one must survive.
console.log("\n\u5c0f\u578b\u5de5\u7a0b\u89c4\u5219\u7684\u8fb9\u754c\uff08\u8fd9\u4e9b\u5fc5\u987b\u4fdd\u7559\uff09");
const SMALL_WORKS_KEEPS: [string, string][] = [
  ["\u8054\u90a6\u516c\u8def\u590d\u7ebf\uff08\u5e26 Rua \u4e5f\u4e0d\u80fd\u6740\uff09", "Duplica\u00e7\u00e3o da Rodovia BR-101, trecho entre a Rua Marginal e o Anel Vi\u00e1rio, com 42 km de extens\u00e3o"],
  ["\u5dde\u9053\u94fa\u88c5", "Execu\u00e7\u00e3o de pavimenta\u00e7\u00e3o asf\u00e1ltica na rodovia MG-050, bairro industrial de Divin\u00f3polis"],
  ["\u533a\u57df\u533b\u9662\uff08\u4e0d\u662f\u793e\u533a\u536b\u751f\u7ad9\uff09", "Constru\u00e7\u00e3o do Hospital Regional de Sobral com 200 leitos, incluindo centro cir\u00fargico e UTI"],
  ["\u5e02\u653f\u4f9b\u6c34\u7cfb\u7edf\uff08\u4e0d\u662f\u4e61\u6751\uff09", "Implanta\u00e7\u00e3o do sistema de abastecimento de \u00e1gua do munic\u00edpio de Feira de Santana, incluindo esta\u00e7\u00e3o de tratamento"],
  ["\u6c61\u6c34\u5904\u7406\u5382", "Constru\u00e7\u00e3o da Esta\u00e7\u00e3o de Tratamento de Esgoto do munic\u00edpio, com rede coletora tronco"],
  ["\u957f\u9014\u5ba2\u8fd0\u7ad9", "Constru\u00e7\u00e3o do Terminal Rodovi\u00e1rio Municipal e do viaduto de acesso"],
];
for (const [label, title] of SMALL_WORKS_KEEPS) {
  check(label, brazilTender(title).relevance.tier !== "excluded", true);
}

// The value exception, which is the whole reason this class uses
// isLargeWorksBuild() rather than a flat word list: a creche at R$50M is not
// the thing the user described, and the rule must let go of it.
check(
  "\u91d1\u989d\u5230\u4e86\u5927\u578b\u5de5\u7a0b\u9608\u503c\u7684\uff0c\u89c4\u5219\u4e0d\u518d\u9002\u7528",
  classifyStoredTender({
    title: "CONTRATA\u00c7\u00c3O DE EMPRESA PARA CONSTRU\u00c7\u00c3O DE CRECHE TIPO 2, PADR\u00c3O FNDE",
    summary: "", buyer: "PREFEITURA MUNICIPAL", country: "Brazil",
    procedureType: "Concorr\u00eancia - Eletr\u00f4nica", governmentLevel: "municipal",
    tenderNumber: undefined,
    scopeType: "works", estimatedValue: 60_000_000, currency: "BRL", sourceName: "PNCP",
  }).relevance.tier !== "excluded",
  true,
);

if (failures > 0) {
  console.log(`${failures} 项没过。`);
  process.exit(1);
}
console.log("全部通过。");
