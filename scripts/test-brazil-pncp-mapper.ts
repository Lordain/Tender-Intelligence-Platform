/**
 * The Brazil mapper, against rows captured from the live PNCP search index
 * on 2026-09-18 (see lib/ingestion/README.md's Brazil section).
 *
 * Every fixture below is a real row, trimmed to the fields the mapper reads.
 * The two that matter most are the ones that cost something to get wrong:
 *
 *  · the timezone. PNCP timestamps carry no offset and are Brasília time.
 *    Read as UTC, a deadline of 2026-05-18T09:30 becomes 06:30 the same day —
 *    harmless — but 2026-10-22T23:30 becomes the 23rd. A deadline off by a
 *    day is the defect this platform spent a whole session fixing in the DOF
 *    mapper; it does not get re-introduced here.
 *  · the title/description swap. `title` is "Edital nº 044/2026". A mapper
 *    that reads it would fill the Brazilian feed with notice numbers, and
 *    every one of them would look plausible.
 *
 * Usage: npm run test:brazil-pncp-mapper
 */
import { inferGovernmentLevel, inferScopeType, inferStatus, mapPncpSearchRowToTender, parsePncpDate, parsePncpItemUrl, pncpPublicUrl, stripRelayPlatformTag, sumPncpItemValues, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";
import { isTransientNetwork } from "@/lib/ingestion/connectors/brazil-pncp-live";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`}`);
}

/** Real row: Mato Grosso state highway MT-020/251, captured 2026-09-18. */
const ROAD: PncpSearchRow = {
  title: "Edital nº 044/2026",
  description: " Contratação de Empresa (s) Especializada(s) para a execução do Componente Ambiental referente à obra de Implantação e Pavimentação da rodovia MT-020/251 do km 42 ao km 48.",
  item_url: "/compras/57356434000146/2026/66",
  numero_controle_pncp: "57356434000146-1-000066/2026",
  orgao_cnpj: "57356434000146",
  orgao_nome: "SECRETARIA DE ESTADO DE INFRAESTRUTURA E LOGISTICA DE MATO GROSSO",
  unidade_nome: "SECRETARIA DE ESTADO DE INFRA-ESTRUTURA",
  esfera_id: "E",
  esfera_nome: "Estadual",
  municipio_nome: "Cuiabá",
  uf: "MT",
  modalidade_licitacao_id: "4",
  modalidade_licitacao_nome: "Concorrência - Eletrônica",
  situacao_nome: "Divulgada no PNCP",
  data_publicacao_pncp: "2026-04-07T09:43:49.860230",
  data_atualizacao_pncp: "2026-09-18T11:00:00.857680007",
  data_inicio_vigencia: "2026-04-07T09:00",
  data_fim_vigencia: "2026-05-18T09:30",
  cancelado: false,
  valor_global: null,
  tem_resultado: true,
};

/** Real item of that same procurement, from /api/pncp/.../itens. */
const ROAD_ITEM = {
  numeroItem: 1,
  descricao: "EXECUÇÃO DO COMPONENTE AMBIENTAL REFERENTE À OBRA DE IMPLANTAÇÃO E PAVIMENTAÇÃO DA RODOVIA MT-020/251 DO KM 42 AO KM 48, LOCALIZADO NOS MUNICÍPIOS DE CUIABÁ/CHAPADA DOS GUIMARÃES.",
  materialOuServico: "S",
  valorUnitarioEstimado: 7494680.99,
  valorTotal: 7494680.99,
  quantidade: 1,
  orcamentoSigiloso: false,
  situacaoCompraItemNome: "Homologado",
  temResultado: true,
};

console.log("brazil-pncp-mapper\n");

console.log("时间戳 —— PNCP 不带时区，是巴西利亚时间（UTC-3）");
check("2026-05-18T09:30 → 12:30Z（不是 09:30Z）", parsePncpDate("2026-05-18T09:30"), "2026-05-18T12:30:00.000Z");
check("九位小数也能解析", parsePncpDate("2026-09-18T11:00:00.857680007"), "2026-09-18T14:00:00.857Z");
check("已带时区的不再加一次", parsePncpDate("2026-09-18T11:06:01.092-03:00"), "2026-09-18T14:06:01.092Z");
// 23:30 local is the case that actually changes the calendar day.
check("当地 23:30 落到第二天 UTC —— 这正是会差一天的那种", parsePncpDate("2026-10-22T23:30"), "2026-10-23T02:30:00.000Z");
check("空值", parsePncpDate(undefined), undefined);
check("垃圾值不抛异常", parsePncpDate("não informado"), undefined);

console.log("\n政府层级 —— 看 esfera_id");
check("F → federal", inferGovernmentLevel("F"), "federal");
check("E → state", inferGovernmentLevel("E"), "state");
check("M → municipal", inferGovernmentLevel("M"), "municipal");
check("「Não se aplica」不猜成 federal", inferGovernmentLevel("N"), "public_company");
check("缺失也不猜", inferGovernmentLevel(undefined), "public_company");

console.log("\n标的类型 —— 葡语文本说了算，不是 PNCP 的 materialOuServico");
check("公路铺装 → works（PNCP 自己标的是「Serviço」）", inferScopeType(ROAD.description!), "works");
check("设计施工总承包 → works，不是 consulting", inferScopeType("ELABORAÇÃO DE PROJETOS EXECUTIVOS E EXECUÇÃO DE OBRA DE CONSTRUÇÃO DE QUADRA POLIESPORTIVA"), "works");
check("只做设计 → consulting", inferScopeType("CONTRATACAO DE EMPRESA ESPECIALIZADA PARA ELABORACAO DE PROJETOS ARQUITETONICOS, ELABORACAO DE ORCAMENTOS E MEMORIAIS TECNICOS"), "consulting");
check("测量勘察 → consulting", inferScopeType("elaboração dos projetos básico e executivo, realização de levantamentos topográficos, sondagens e ensaios geotécnicos"), "consulting");
check("采购设备 → equipment", inferScopeType("Aquisição de equipamentos de musculação, equipamentos aeróbicos e acessórios"), "equipment");
check("垃圾清运 → services", inferScopeType("PRESTAÇÃO DOS SERVIÇOS DE COLETA, TRANSPORTE E DESTINAÇÃO DE RESÍDUOS SÓLIDOS DOMICILIARES"), "services");

console.log("\n金额 —— 预算保密和「没有明细」都不能变成 0");
check("单条明细求和", sumPncpItemValues([ROAD_ITEM]), { value: 7494680.99, sealedItems: 0 });
check("多条明细累加", sumPncpItemValues([ROAD_ITEM, { valorTotal: 1000 }]), { value: 7495680.99, sealedItems: 0 });
check("预算保密 → 不是 0，是「未知」", sumPncpItemValues([{ orcamentoSigiloso: true, valorTotal: null }]), { sealedItems: 1 });
check("空明细 → 未知", sumPncpItemValues([]), { sealedItems: 0 });
check("没取到明细 → 未知", sumPncpItemValues(undefined), { sealedItems: 0 });
// Real drift, not a contrived one: these three values are the first three
// items of the Elói Mendes tender (20347225000126/2026/200), whose 224-item
// sum came back 2812092.0900000026 against a portal reading 2.812.092,09.
check("浮点累加取整到分", sumPncpItemValues([{ valorTotal: 0.1 }, { valorTotal: 0.2 }]), { value: 0.3, sealedItems: 0 });

console.log("\n状态");
const beforeDeadline = new Date("2026-05-01T00:00:00Z");
check("tem_resultado → awarded（规则 6 在展示层兜底）", inferStatus(ROAD), "awarded");
check("撤销 → cancelled", inferStatus({ ...ROAD, situacao_nome: "Revogada", tem_resultado: false }), "cancelled");
check("cancelado 标记 → cancelled", inferStatus({ ...ROAD, cancelado: true, tem_resultado: false }), "cancelled");
check("中止 → suspended（暂停中，可恢复）", inferStatus({ ...ROAD, situacao_nome: "Suspensa", tem_resultado: false }), "suspended");
check("Deserta → deserted（流标）", inferStatus({ ...ROAD, situacao_nome: "Deserta", tem_resultado: false }), "deserted");
check("截止日已过 → submission_closed", inferStatus({ ...ROAD, tem_resultado: false }), "submission_closed");
check("截止日未到 → open", inferStatus({ ...ROAD, tem_resultado: false }, beforeDeadline), "open");

console.log("\nitem_url 三元组");
check("解析出 CNPJ／年／序号", parsePncpItemUrl("/compras/57356434000146/2026/66"), { cnpj: "57356434000146", ano: "2026", sequencial: "66" });
check("认不出来返回 null，不抛异常", parsePncpItemUrl("/app/editais/algo"), null);

console.log("\n整行映射");
const tender = mapPncpSearchRowToTender(ROAD, [ROAD_ITEM], "PNCP");
if (!tender) {
  console.log("  ✗ 整行映射返回了 null");
  failures += 1;
} else {
  check("标题取的是 description，不是「Edital nº 044/2026」", tender.title.es, ROAD.description!.trim());
  check("tenderNumber 是 numero_controle_pncp", tender.tenderNumber, "57356434000146-1-000066/2026");
  check("slug 全局唯一（带 CNPJ）", tender.slug, "brazil-57356434000146-1-000066-2026");
  check("采购单位", tender.buyer, ROAD.orgao_nome);
  check("国家", tender.country, "Brazil");
  check("层级", tender.governmentLevel, "state");
  check("金额是雷亚尔", [tender.estimatedValue, tender.currency], [7494680.99, "BRL"]);
  check("交标截止日按巴西利亚时间换算", tender.submissionDeadline, "2026-05-18T12:30:00.000Z");
  check("所在地", tender.location, "Cuiabá/MT");
  // Verified against the live portal 2026-09-18: /compras/... is an API path
  // and 404s in a browser; the reader-facing route is /app/editais/...
  check("来源链接是前台路由 /app/editais，不是 API 的 /compras", tender.sourceUrl, "https://pncp.gov.br/app/editais/57356434000146/2026/66");
}

console.log("\n缺必要字段就不要这一行");
check("没有 description", mapPncpSearchRowToTender({ ...ROAD, description: "  " }, [ROAD_ITEM], "PNCP"), null);
check("没有 numero_controle_pncp", mapPncpSearchRowToTender({ ...ROAD, numero_controle_pncp: undefined }, [ROAD_ITEM], "PNCP"), null);
check("没有发布日期", mapPncpSearchRowToTender({ ...ROAD, data_publicacao_pncp: undefined }, [ROAD_ITEM], "PNCP"), null);

const noItems = mapPncpSearchRowToTender(ROAD, undefined, "PNCP");
check("取不到明细时不写 0，而是不写金额", [noItems?.estimatedValue, noItems?.currency], [undefined, undefined]);

console.log();

// --- relaying platforms' own tags, from a real excluded-CSV row -------------
check(
  "去掉转发平台标签",
  stripRelayPlatformTag("[Portal de Compras P\u00fablicas] - CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA A EXECU\u00c7\u00c3O DE OBRA"),
  "CONTRATA\u00c7\u00c3O DE EMPRESA ESPECIALIZADA PARA A EXECU\u00c7\u00c3O DE OBRA",
);
// The over-breadth pins. A lot marker carries real information and must
// survive — losing it would merge two different lots into one indistinct
// title.
check(
  "[LOTE 1] \u4e0d\u80fd\u88ab\u5f53\u6210\u5e73\u53f0\u6807\u7b7e\u53bb\u6389",
  stripRelayPlatformTag("[LOTE 1] - CONSTRU\u00c7\u00c3O DE PONTE"),
  "[LOTE 1] - CONSTRU\u00c7\u00c3O DE PONTE",
);
check(
  "\u6ca1\u6709\u5206\u9694\u7b26\u7684\u65b9\u62ec\u53f7\u4e5f\u4e0d\u52a8",
  stripRelayPlatformTag("[Anexo] CONSTRU\u00c7\u00c3O DE PONTE"),
  "[Anexo] CONSTRU\u00c7\u00c3O DE PONTE",
);
check("\u6ca1\u6709\u65b9\u62ec\u53f7\u7684\u539f\u6837\u8fd4\u56de", stripRelayPlatformTag("CONSTRU\u00c7\u00c3O DE PONTE"), "CONSTRU\u00c7\u00c3O DE PONTE");


console.log("\n\u524d\u53f0\u94fe\u63a5");
check(
  "\u4ece item_url \u62fc\u51fa /app/editais",
  pncpPublicUrl("/compras/35842428000166/2026/8"),
  "https://pncp.gov.br/app/editais/35842428000166/2026/8",
);
check("\u8ba4\u4e0d\u51fa\u6765\u5c31\u56de\u516c\u544a\u5217\u8868\uff0c\u4e0d\u81ea\u5df1\u7f16\u8def\u5f84", pncpPublicUrl("/app/algo"), "https://pncp.gov.br/app/editais");
check("\u7a7a\u503c\u4e5f\u56de\u5217\u8868", pncpPublicUrl(undefined), "https://pncp.gov.br/app/editais");


console.log("\n\u5173\u952e\u65e5\u671f");
const roadDates = mapPncpSearchRowToTender(ROAD, [ROAD_ITEM], "PNCP")!.keyDates;
check("\u53d1\u5e03 + \u4ea4\u6807\u622a\u6b62\u4e24\u6761", roadDates.map((d) => d.type), ["publication", "submission"]);
check("\u4ea4\u6807\u622a\u6b62\u6309\u5df4\u897f\u5229\u4e9a\u65f6\u95f4\u6362\u7b97", roadDates.find((d) => d.type === "submission")?.date, "2026-05-18T12:30:00.000Z");
// data_inicio_vigencia exists in the feed and is deliberately NOT stored:
// no TenderKeyDate type means it, and `clarification` would show the reader
// 「采购方召开的澄清会议」 for something that is not one.
check("\u6295\u6807\u5f00\u59cb\u65e5\u4e0d\u5b58\uff0c\u5b81\u7f3a\u4e0d\u9519\u6807", roadDates.some((d) => d.date === "2026-04-07T12:00:00.000Z"), false);

// Retrying the right failures. The predicate used to check ECONNRESET alone,
// so Node's bare `TypeError: fetch failed` — which is how a connect-level
// refusal actually arrives — was thrown on the first attempt instead of
// retried. Probe run #16 (2026-09-21) hit exactly that: four of four queries
// "failed" while PNCP was throttling, ten minutes after three of the same four
// had been answered.
check("裸 fetch failed 要重试", isTransientNetwork(new TypeError("fetch failed")), true);
check("带 cause 的连接被拒要重试", isTransientNetwork(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) })), true);
check("undici 连接超时要重试", isTransientNetwork(Object.assign(new Error("x"), { code: "UND_ERR_CONNECT_TIMEOUT" })), true);
check("ECONNRESET 还是要重试", isTransientNetwork(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), true);
check("DNS 查不到要重试", isTransientNetwork(Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" })), true);
// Not everything is transient: a request we got wrong must not be retried, or
// a 400 turns into 109 seconds of sleeping before the same 400.
check("自己写错的请求不重试", isTransientNetwork(new Error("PNCP responded 400 — bad request")), false);
check("随便一个错不重试", isTransientNetwork(new Error("something else")), false);
check("不是 Error 的东西不重试", isTransientNetwork("fetch failed"), false);

if (failures > 0) {
  console.log(`${failures} 项没过。`);
  process.exit(1);
}
console.log("全部通过。");
