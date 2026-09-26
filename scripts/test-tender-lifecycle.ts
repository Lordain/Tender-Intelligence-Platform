/**
 * The tender lifecycle added 2026-09-26 (migration 0057): 暂停中 and 流标 as
 * statuses, each source's words for them, the status refresh that moves
 * stored tenders when their source changes, and re-issue matching.
 *
 * Offline: the refresh runs against an in-memory stand-in for Supabase that
 * answers only the three calls status-refresh.ts makes.
 *
 *   npm run test:tender-lifecycle
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderStatus } from "../types/tender";
import { oxiEstadoStatus } from "../lib/ingestion/peru-oxi-mapper";
import { pncpCompraStatus } from "../lib/ingestion/ingest-brazil";
import { chileFichaEstadoStatus, parseChileFichaEstado } from "../lib/ingestion/chile-ficha-parser";
import { comprasMxRefreshStatus } from "../lib/ingestion/refresh-comprasmx-statuses";
import { inferStatus as comprasMxImportStatus } from "../lib/ingestion/compras-mx-open-tenders-mapper";
import { mapOeceRecordToTender, type OeceRecord } from "../lib/ingestion/peru-oece-mapper";
import { reissueTitleKey } from "../lib/ingestion/reissue";
import { refreshStoredStatuses } from "../lib/ingestion/status-refresh";
import { isReleasedAfterDeadline } from "../lib/access-control";
import { LIVE_STATUS_FILTER_PARAM, VISIBLE_TENDER_STATUSES } from "../lib/tender-status";

let failures = 0;
let count = 0;
function check(name: string, actual: unknown, expected: unknown) {
  count += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`}`);
}

console.log("\nPeru OxI — every Estado in the user's all-states export (2026-09-26)");
check("En Proceso → open", oxiEstadoStatus("En Proceso"), "open");
check("Suspendido (Antes de la Buena Pro) → suspended", oxiEstadoStatus("Suspendido (Antes de la Buena Pro)"), "suspended");
check("Suspendido (Después de la Buena Pro) → suspended", oxiEstadoStatus("Suspendido (Después de la Buena Pro)"), "suspended");
check("Adjudicado → awarded", oxiEstadoStatus("Adjudicado"), "awarded");
check("Convenio/Contrato Suscrito → awarded", oxiEstadoStatus("Convenio/Contrato Suscrito"), "awarded");
check("Desierto → deserted", oxiEstadoStatus("Desierto"), "deserted");
check("Cancelado → cancelled", oxiEstadoStatus("Cancelado"), "cancelled");
check("Nulidad → cancelled", oxiEstadoStatus("Nulidad"), "cancelled");
check("Otros → no reading", oxiEstadoStatus("Otros"), undefined);
check("empty → no reading", oxiEstadoStatus(""), undefined);

console.log("\nBrazil PNCP — consulta situação");
check("Divulgada, no result → open", pncpCompraStatus({ situacaoCompraId: 1, existeResultado: false }), "open");
check("Divulgada, result → awarded", pncpCompraStatus({ situacaoCompraId: 1, existeResultado: true }), "awarded");
check("Revogada → cancelled", pncpCompraStatus({ situacaoCompraId: 2 }), "cancelled");
check("Anulada → cancelled", pncpCompraStatus({ situacaoCompraId: 3 }), "cancelled");
check("Suspensa → suspended", pncpCompraStatus({ situacaoCompraId: 4 }), "suspended");
check("unknown situação → no reading", pncpCompraStatus({ situacaoCompraId: 9 }), undefined);

console.log("\nChile — ficha estado");
const ficha = readFileSync(path.join(__dirname, "../lib/ingestion/__fixtures__/chile/ficha-attachments.html"), "utf8");
check("fixture ficha reads Publicada", parseChileFichaEstado(ficha), "Publicada");
check("Publicada → open", chileFichaEstadoStatus("Publicada"), "open");
check("Suspendida → suspended", chileFichaEstadoStatus("Suspendida"), "suspended");
check("Desierta → deserted", chileFichaEstadoStatus("Desierta"), "deserted");
check("Revocada → cancelled", chileFichaEstadoStatus("Revocada"), "cancelled");
check("Adjudicada → awarded", chileFichaEstadoStatus("Adjudicada"), "awarded");
check("unknown → no reading", chileFichaEstadoStatus("Algo nuevo"), undefined);

console.log("\nMexico Compras MX — import and refresh");
check("import: SUSPENDIDO → suspended (was cancelled)", comprasMxImportStatus("SUSPENDIDO"), "suspended");
check("import: DESIERTO → deserted (was cancelled)", comprasMxImportStatus("DESIERTO"), "deserted");
check("import: CANCELADO → cancelled", comprasMxImportStatus("CANCELADO"), "cancelled");
check("refresh: VIGENTE → open", comprasMxRefreshStatus("VIGENTE", "vigente"), "open");
check("refresh: SUSPENDIDO → suspended", comprasMxRefreshStatus("SUSPENDIDO", "seguimiento"), "suspended");
check("refresh: ADJUDICADO → awarded", comprasMxRefreshStatus("ADJUDICADO", "concluido"), "awarded");
check("refresh: POR EVALUAR in seguimiento → submission_closed", comprasMxRefreshStatus("POR EVALUAR", "seguimiento"), "submission_closed");
check("refresh: unknown word in concluido → no reading (not open)", comprasMxRefreshStatus("ALGO", "concluido"), undefined);

console.log("\nPeru OECE — end states read only when the source states them");
const oece = (JSON.parse(readFileSync(path.join(__dirname, "../lib/ingestion/__fixtures__/sample-peru-oece.json"), "utf8")) as { records: OeceRecord[] }).records
  .find((record) => !(record.compiledRelease.awards && record.compiledRelease.awards.length > 0))!;
const withItems = (details: string[], status?: string): OeceRecord => ({
  ...oece,
  compiledRelease: { ...oece.compiledRelease, tender: { ...oece.compiledRelease.tender, status, items: details.map((statusDetails) => ({ statusDetails })) } },
});
const oeceStatus = (record: OeceRecord) => mapOeceRecordToTender(record, "OECE")?.status;
check("fixture record → open", oeceStatus(oece), "open");
check("every item DESIERTO → deserted", oeceStatus(withItems(["DESIERTO", "DESIERTO"])), "deserted");
check("one item of two DESIERTO → still open (other lot running)", oeceStatus(withItems(["DESIERTO", "CONVOCADO"])), "open");
check("OCDS unsuccessful → deserted", oeceStatus(withItems(["CONVOCADO"], "unsuccessful")), "deserted");
check("every item SUSPENDIDO → suspended", oeceStatus(withItems(["SUSPENDIDO"])), "suspended");

console.log("\nFilters and release");
check("暂停中 and 流标 are offered as filters", ["suspended", "deserted"].every((s) => VISIBLE_TENDER_STATUSES.includes(s as TenderStatus)), true);
check("当前在招 excludes 暂停中 and 流标", LIVE_STATUS_FILTER_PARAM.split(",").some((s) => s === "suspended" || s === "deserted"), false);
check("a suspended tender is never released after its old deadline", isReleasedAfterDeadline({ status: "suspended", submissionDeadline: "2026-09-01" }, "2026-09-26"), false);
check("a deserted tender with no deadline releases from its end", isReleasedAfterDeadline({ status: "deserted", closedOn: "2026-09-20" }, "2026-09-26"), true);

console.log("\nRe-issue title key");
const base = "ADQUISICION DE EQUIPOS BIOMEDICOS PARA EL HOSPITAL REGIONAL DE HUANCAYO";
check("SEGUNDA CONVOCATORIA is ignored", reissueTitleKey(`${base} - SEGUNDA CONVOCATORIA`), reissueTitleKey(base));
check("(2DA CONVOCATORIA) is ignored", reissueTitleKey(`${base} (2DA CONVOCATORIA)`), reissueTitleKey(base));
check("2ª convocatoria is ignored", reissueTitleKey(`${base} 2ª convocatoria`), reissueTitleKey(base));
check("accents and case are ignored", reissueTitleKey("Adquisición de Equipos"), reissueTitleKey("ADQUISICION DE EQUIPOS"));
check("a different lot number still differs", reissueTitleKey(`${base} LOTE 2`) === reissueTitleKey(`${base} LOTE 3`), false);

// ---------------------------------------------------------------------------
// refreshStoredStatuses against an in-memory table.
type Row = { id: string; slug: string; status: TenderStatus; title: { es: string }; submission_deadline: string | null; publication_date: string; source_name: string; manual_field_overrides: string[] | null };

function fakeSupabase(rows: Row[], migrated: boolean) {
  const updates: { status: TenderStatus; ids: string[] }[] = [];
  const client = {
    from(table: string) {
      if (table === "tender_reissues") {
        return { select: () => ({ limit: async () => (migrated ? { data: [], error: null } : { data: null, error: { message: "relation does not exist" } }) }) };
      }
      return {
        select: () => ({ in: async (_: string, slugs: string[]) => ({ data: rows.filter((row) => slugs.includes(row.slug)), error: null }) }),
        update: (values: { status: TenderStatus }) => ({
          in: async (_: string, ids: string[]) => {
            updates.push({ status: values.status, ids });
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

const NOW = new Date("2026-09-26T16:00:00.000Z");
const row = (slug: string, status: TenderStatus, extra: Partial<Row> = {}): Row => ({
  id: `id-${slug}`,
  slug,
  status,
  title: { es: slug },
  submission_deadline: "2026-10-20",
  publication_date: "2026-09-10",
  source_name: "test",
  manual_field_overrides: null,
  ...extra,
});

async function refreshCases() {
  console.log("\nStatus refresh — what moves and what does not");
  {
    const { client, updates } = fakeSupabase(
      [
        row("pause", "open"),
        row("resume", "suspended"),
        row("locked", "open", { manual_field_overrides: ["status"] }),
        row("reopen", "awarded", { submission_deadline: "2026-09-01" }),
        row("noop", "open", { submission_deadline: "2026-09-01" }),
        row("end", "open"),
      ],
      true,
    );
    const result = await refreshStoredStatuses(
      client,
      [
        { slug: "pause", status: "suspended" },
        { slug: "resume", status: "open" },
        { slug: "locked", status: "cancelled" },
        { slug: "reopen", status: "open" },
        // Stored open with a passed deadline already reads 已截止; writing it
        // would only log a change nobody sees and email subscribers about it.
        { slug: "noop", status: "submission_closed" },
        { slug: "end", status: "deserted" },
        { slug: "not-stored", status: "cancelled" },
      ],
      { write: true, now: NOW },
    );
    check("changes: pause, resume, end", result.changes.map((c) => `${c.slug}:${c.from}->${c.to}`).sort(), ["end:open->deserted", "pause:open->suspended", "resume:suspended->open"]);
    check("a hand-set status is left alone", result.protectedSlugs, ["locked"]);
    check("a finished tender is not reopened", result.reopenRefused.map((c) => c.slug), ["reopen"]);
    check("matched only stored slugs", result.matchedCount, 6);
    check("one update per target status", updates.map((u) => `${u.status}:${u.ids.join(",")}`).sort(), ["deserted:id-end", "open:id-resume", "suspended:id-pause"]);
  }
  {
    const { client, updates } = fakeSupabase([row("pause", "open"), row("end", "open")], false);
    const result = await refreshStoredStatuses(client, [{ slug: "pause", status: "suspended" }, { slug: "end", status: "deserted" }], { write: true, now: NOW });
    check("before 0057: suspended is held back, not written as something else", result.awaitingMigration, 1);
    check("before 0057: deserted is written as the old cancelled", updates.map((u) => `${u.status}:${u.ids.join(",")}`), ["cancelled:id-end"]);
  }
  {
    const { client, updates } = fakeSupabase([row("pause", "open")], true);
    const result = await refreshStoredStatuses(client, [{ slug: "pause", status: "suspended" }], { write: false, now: NOW });
    check("dry run reports the change", result.changes.length, 1);
    check("dry run writes nothing", updates.length, 0);
  }
}

refreshCases().then(() => {
  console.log(`\n${count - failures}/${count} passed`);
  if (failures > 0) process.exit(1);
});
