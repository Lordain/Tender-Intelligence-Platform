/**
 * The ProInversión bases cronograma paste (lib/ingestion/proinversion-cronograma.ts),
 * on the Grupo 4 schedule the user pasted on 2026-10-10 — every dated step
 * kept, the undated ones reported — and the milestone type's display.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProinversionCronograma } from "../lib/ingestion/proinversion-cronograma";
import { parseAnyCronograma } from "../lib/ingestion/proyectos-estrategicos-cronograma";
import { diffAgainstExisting } from "../lib/ingestion/seace-cronograma";
import { findKeyDateProblems } from "../lib/ingestion/key-date-checks";
import { keyDateTitle } from "../lib/tender-labels";

const pasted = readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/peru-proinversion-app/cronograma-bases-grupo-4-2026-10-10.txt"), "utf8");

const any = parseAnyCronograma(pasted);
assert.equal(any.format, "proinversion");
// SEACE and Proyectos Estratégicos pastes are still read as before.
assert.equal(parseAnyCronograma("Etapa\tFecha Inicio\tFecha Fin\nConvocatoria\t10/09/2026\t10/09/2026").format, "seace");
assert.equal(parseAnyCronograma("Fecha y hora de presentación y apertura de proposiciones:\n08/10/2026 11:00").format, "proyectos-estrategicos");

const { rows, ignored, unparsed } = parseProinversionCronograma(pasted);
const byDate = (type: string, date: string) => rows.find((row) => row.type === type && row.date === date);

// The deadline: the qualification request, since the envelopes have no date yet.
assert.equal(rows.filter((row) => row.type === "submission").length, 1);
assert.equal(byDate("submission", "2026-12-04")?.label, "Presentación de solicitud de Calificación");
assert.equal(byDate("questions_deadline", "2026-09-24")?.label, "Consultas a las Bases");
// The participation fee, kept and marked as a step nobody can skip.
const fee = byDate("milestone", "2026-11-27")!;
assert.equal(fee.notes?.zh, "支付参与费（报名费）截止");
assert.equal(fee.notes?.es, "Pago del Derecho de Participación");
assert.equal(fee.mandatory, true);
// Every dated step of the paste: 1.1-1.3, 2.2-2.7, 3.1-3.5 = 14, plus the card naming the deadline.
assert.equal(rows.length, 15);
assert.equal(byDate("milestone", "2027-01-26")?.notes?.zh, "发布合同终稿");
assert.equal(byDate("milestone", "2027-02-05")?.notes?.zh, "组建或变更联合体截止");
assert.equal(byDate("milestone", "2026-12-04")?.notes?.zh, "资格申请截止（即本页的提交截止）");
// "2.6" pasted twice is one row.
assert.equal(rows.filter((row) => row.label === "Sugerencias a la Tercera Versión de los Contratos").length, 1);
// Steps with no date of their own are reported, not guessed.
assert.deepEqual(ignored.map((item) => item.label), [
  "Versión Inicial de los Contratos",
  "Presentación de los sobres Nro. 1 y Nro. 2 y Buena Pro",
  "Subsanación de Observaciones al sobre Nro. 1",
  "Apertura del sobre Nro. 2 y Buena Pro",
  "Fecha de Cierre del Concurso",
]);
assert.deepEqual(unparsed, []);

// Once a circular dates the envelopes, they are the deadline and the qualification request one more step.
const dated = parseProinversionCronograma(pasted.replace("A los 30 días calendario de la entrega de la Versión Final de los Contratos (**)", "Jueves 25.02.2027"));
assert.equal(dated.rows.find((row) => row.type === "submission")?.date, "2027-02-25");
assert.equal(dated.rows.find((row) => row.date === "2026-12-04")?.type, "milestone");
// A row pasted with its date on the same line.
assert.equal(parseProinversionCronograma("3.1. Pago del Derecho de Participación\tHasta el viernes 27.11.2026\n").rows[0]?.label, "Pago del Derecho de Participación");

// Milestones are all inserted (each is its own step) and never checked for order.
assert.equal(diffAgainstExisting(rows.filter((row) => row.type === "milestone"), []).toInsert.length, rows.filter((row) => row.type === "milestone").length);
assert.deepEqual(findKeyDateProblems(rows.flatMap((row) => (row.type === "milestone" ? [] : [{ type: row.type, date: row.date }])), { publicationDate: "2026-04-15" }), []);

// Shown under its own name; the other types keep their labels.
assert.equal(keyDateTitle({ type: "milestone", notes: fee.notes }, "zh"), "支付参与费（报名费）截止");
assert.equal(keyDateTitle({ type: "milestone", notes: fee.notes }, "es"), "Pago del Derecho de Participación");
assert.equal(keyDateTitle({ type: "milestone" }, "zh"), "其他节点");
assert.equal(keyDateTitle({ type: "submission", notes: { zh: "x", en: "x", es: "x" } }, "zh"), "提交截止");

console.log("proinversion-cronograma: all checks passed");
