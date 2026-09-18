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
import { inferGovernmentLevel, inferScopeType, inferStatus, mapPncpSearchRowToTender, parsePncpDate, parsePncpItemUrl, sumPncpItemValues, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";

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

console.log("\n状态");
const beforeDeadline = new Date("2026-05-01T00:00:00Z");
check("tem_resultado → awarded（规则 6 在展示层兜底）", inferStatus(ROAD), "awarded");
check("撤销 → cancelled", inferStatus({ ...ROAD, situacao_nome: "Revogada", tem_resultado: false }), "cancelled");
check("cancelado 标记 → cancelled", inferStatus({ ...ROAD, cancelado: true, tem_resultado: false }), "cancelled");
check("中止 → submission_closed（本项目没有 suspended 这个状态）", inferStatus({ ...ROAD, situacao_nome: "Suspensa", tem_resultado: false }), "submission_closed");
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
  check("来源链接用行里给的 item_url", tender.sourceUrl, "https://pncp.gov.br/compras/57356434000146/2026/66");
}

console.log("\n缺必要字段就不要这一行");
check("没有 description", mapPncpSearchRowToTender({ ...ROAD, description: "  " }, [ROAD_ITEM], "PNCP"), null);
check("没有 numero_controle_pncp", mapPncpSearchRowToTender({ ...ROAD, numero_controle_pncp: undefined }, [ROAD_ITEM], "PNCP"), null);
check("没有发布日期", mapPncpSearchRowToTender({ ...ROAD, data_publicacao_pncp: undefined }, [ROAD_ITEM], "PNCP"), null);

const noItems = mapPncpSearchRowToTender(ROAD, undefined, "PNCP");
check("取不到明细时不写 0，而是不写金额", [noItems?.estimatedValue, noItems?.currency], [undefined, undefined]);

console.log();
if (failures > 0) {
  console.log(`${failures} 项没过。`);
  process.exit(1);
}
console.log("全部通过。");
