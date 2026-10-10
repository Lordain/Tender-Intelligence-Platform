/**
 * The duplicate-procurement fingerprint (lib/ingestion/duplicate-procurement.ts).
 *
 *   npm run test:duplicate-procurement
 */
import { procurementFingerprint } from "../lib/ingestion/duplicate-procurement";

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

console.log(failed === 0 ? `全部 ${passed} 项通过` : `${failed} 项失败`);
if (failed > 0) process.exit(1);
