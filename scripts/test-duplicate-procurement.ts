/**
 * The duplicate-procurement fingerprint (lib/ingestion/duplicate-procurement.ts).
 *
 *   npm run test:duplicate-procurement
 */
import { groupDuplicateProcurements, procurementFingerprint, procurementFingerprints, sameNumberDuplicates } from "../lib/ingestion/duplicate-procurement";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}`);
}

// The real pair found 2026-10-10: AGETO posted the TO-428 road contract on
// PNCP twice, once from Comprasnet and once by hand an hour later.
const base = {
  country: "Brazil",
  buyer: "AGENCIA TOCANTINENSE  DE TRANSPORTES E OBRAS - AGETO",
  estimatedValue: 67_559_727.19,
  currency: "BRL",
  submissionDeadline: "2026-11-05T09:59:00",
};
const comprasnet = procurementFingerprint({ ...base, title: "Contratação de empresa de engenharia para Implantação e Pavimentação da Rodovia TO-428, Trecho Barro Alto - Recursolândia, Com Extensão de 23,38 Km." });
const byHand = procurementFingerprint({ ...base, title: "CONTRATAÇÃO DE EMPRESA DE ENGENHARIA PARA IMPLANTAÇÃO E PAVIMENTAÇÃO DA RODOVIA TO-428, TRECHO BARRO ALTO - RECURSOLÂNDIA, COM EXTENSÃO DE 23,38 KM. " });
check("TO-428 的两次发布是同一个项目（大小写、重音、标点不同）", comprasnet !== null && comprasnet === byHand);
check("同一天不同时刻的截止时间也算同一天", procurementFingerprint({ ...base, title: "x", submissionDeadline: "2026-11-05" }) === procurementFingerprint({ ...base, title: "x", submissionDeadline: "2026-11-05T18:00:00Z" }));
check("金额不同（另一个标段）不算重复", comprasnet !== procurementFingerprint({ ...base, estimatedValue: 67_559_727.2, title: "Contratação de empresa de engenharia para Implantação e Pavimentação da Rodovia TO-428, Trecho Barro Alto - Recursolândia, Com Extensão de 23,38 Km." }));
check("截止日不同（重新发布）不算重复", comprasnet !== procurementFingerprint({ ...base, submissionDeadline: "2026-11-20", title: "Contratação de empresa de engenharia para Implantação e Pavimentação da Rodovia TO-428, Trecho Barro Alto - Recursolândia, Com Extensão de 23,38 Km." }));
check("标题不同不算重复", comprasnet !== procurementFingerprint({ ...base, title: "Pavimentação da Rodovia TO-030" }));
check("采购单位不同不算重复", comprasnet !== procurementFingerprint({ ...base, buyer: "DNIT", title: "Contratação de empresa de engenharia para Implantação e Pavimentação da Rodovia TO-428, Trecho Barro Alto - Recursolândia, Com Extensão de 23,38 Km." }));
check("没有金额的不参与判断", procurementFingerprint({ ...base, estimatedValue: undefined, title: "x" }) === null);
check("没有截止日的不参与判断", procurementFingerprint({ ...base, submissionDeadline: null, title: "x" }) === null);
check("币种不同不算重复", procurementFingerprint({ ...base, title: "x" }) !== procurementFingerprint({ ...base, currency: "USD", title: "x" }));

// Brazil without the title (same day, after the cleanup preview): Fortaleza's
// edital 67/2026 posted twice, worded differently each time.
const fortaleza = { country: "Brazil", buyer: "MUNICIPIO DE FORTALEZA", estimatedValue: 29_290_863.59, currency: "BRL", submissionDeadline: "2026-12-17T09:00:00" };
const fromSystem = procurementFingerprints({ ...fortaleza, title: "SERVIÇOS DE ELABORAÇÃO DE PROJETOS BÁSICOS E EXECUTIVOS DE ENGENHARIA, TÚNEL SILAS MUNGUBA" });
const byHand2 = procurementFingerprints({ ...fortaleza, title: "CONTRATAÇÃO INTEGRADA DE EMPRESA PARA A PRESTAÇÃO DE SERVIÇOS DE ELABORAÇÃO DE PROJETOS" });
check("巴西：同一采购单位、金额、截止日，标题措辞不同也算同一个项目", fromSystem.some((key) => byHand2.includes(key)));
check("巴西：金额差一分钱就不算", !fromSystem.some((key) => procurementFingerprints({ ...fortaleza, estimatedValue: 29_290_863.6, title: "x" }).includes(key)));
// Mexico: template schools for different campuses, one amount and deadline.
const school = { country: "Mexico", buyer: "DGETI", estimatedValue: 20_000_000, currency: "MXN", submissionDeadline: "2026-10-06" };
const cosio = procurementFingerprints({ ...school, title: "Construcción del bachillerato Margarita Maza, plantel Cosío" });
const sanFrancisco = procurementFingerprints({ ...school, title: "Construcción del bachillerato Margarita Maza, plantel San Francisco" });
check("墨西哥：同金额同截止日的不同校区不算重复", !cosio.some((key) => sanFrancisco.includes(key)));

const rows = [
  { id: "a", input: { ...fortaleza, title: "uno" } },
  { id: "b", input: { ...fortaleza, title: "dos" } },
  { id: "c", input: { ...school, title: "Cosío" } },
  { id: "d", input: { ...school, title: "San Francisco" } },
  { id: "e", input: { ...school, title: "Cosío" } },
];
const groups = groupDuplicateProcurements(rows, (row) => row.id, (row) => row.input).map((group) => group.map((row) => row.id).sort().join(","));
check("分组：巴西两条一组，墨西哥只有标题相同的一组", JSON.stringify(groups.sort()) === JSON.stringify(["a,b", "c,e"]));

// Mexico: one procedure number, one row, whichever source came first
// (2026-11-10, 谁先进来留谁). The seven real pairs went both ways.
const T21 = "FP-09-210-009000999-T-21-2026";
const T25 = "FP-09-210-009000999-T-25-2026";
const mx = (slug: string, tenderNumber: string) => ({ slug, tenderNumber, country: "Mexico" });
// LicitIA first (11:56), then the admin's Proyectos Estratégicos upload (21:40).
const upload = sameNumberDuplicates(
  [mx("proyectosestrategicos-fp-09-210-009000999-t-21-2026", T21)],
  [{ slug: "comprasmx-fp-09-210-009000999-t-21-2026", tenderNumber: T21, country: "Mexico" }],
);
check("先有 Compras MX 那条，再手动导入同一个编号：不建第二条", upload.length === 1 && upload[0].twin === "comprasmx-fp-09-210-009000999-t-21-2026");
// The upload first (21:40), then LicitIA (21:41) — the check runs at write time.
const licitia = sameNumberDuplicates(
  [mx("comprasmx-fp-09-210-009000999-t-25-2026", T25)],
  [{ slug: "proyectosestrategicos-fp-09-210-009000999-t-25-2026", tenderNumber: T25, country: "Mexico" }],
);
check("先手动导入，LicitIA 后到：也不建第二条", licitia.length === 1 && licitia[0].slug === "comprasmx-fp-09-210-009000999-t-25-2026");
check(
  "已经在库里的那条照常更新（同一个 slug 不算重复）",
  sameNumberDuplicates([mx("proyectosestrategicos-fp-09-210-009000999-t-25-2026", T25)], [{ slug: "proyectosestrategicos-fp-09-210-009000999-t-25-2026", tenderNumber: T25, country: "Mexico" }]).length === 0,
);
check(
  "一对已经重复的旧数据：两条都照常更新，不会被冻住",
  sameNumberDuplicates(
    [mx("comprasmx-fp-09-210-009000999-t-21-2026", T21), mx("proyectosestrategicos-fp-09-210-009000999-t-21-2026", T21)],
    [{ slug: "comprasmx-fp-09-210-009000999-t-21-2026", tenderNumber: T21, country: "Mexico" }, { slug: "proyectosestrategicos-fp-09-210-009000999-t-21-2026", tenderNumber: T21, country: "Mexico" }],
  ).length === 0,
);
check("编号大小写不同也认作同一个", sameNumberDuplicates([mx("a", T21.toLowerCase())], [{ slug: "b", tenderNumber: T21, country: "Mexico" }]).length === 1);
check("同一次导入里两个 slug 同编号：只留第一条", sameNumberDuplicates([mx("a", T21), mx("b", T21)], []).map((d) => d.slug).join() === "b");
check("编号不同不受影响", sameNumberDuplicates([mx("a", T21)], [{ slug: "b", tenderNumber: T25, country: "Mexico" }]).length === 0);
check(
  "哥伦比亚同编号（各市自己的 LP-006-2026）不按编号合并",
  sameNumberDuplicates([{ slug: "secop-800100000-lp-006-2026", tenderNumber: "LP-006-2026", country: "Colombia" }], [{ slug: "secop-800200000-lp-006-2026", tenderNumber: "LP-006-2026", country: "Colombia" }]).length === 0,
);
check("没有编号的不参与判断", sameNumberDuplicates([mx("a", "  ")], [{ slug: "b", tenderNumber: "  ", country: "Mexico" }]).length === 0);

console.log(failed === 0 ? `全部 ${passed} 项通过` : `${failed} 项失败`);
if (failed > 0) process.exit(1);
