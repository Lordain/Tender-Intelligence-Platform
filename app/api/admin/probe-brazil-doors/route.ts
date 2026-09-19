import { getAdminUser } from "@/lib/admin-auth";
import { knockAllDoors, renderDoorReport } from "@/lib/ingestion/brazil-doors";

/**
 * Knocks on every Brazilian concession/auction door from THIS deployment.
 *
 * The door list, the verdict rules and the report live in
 * lib/ingestion/brazil-doors.ts, because the same knock has to happen from a
 * GitHub Actions runner too — see .github/workflows/probe-brazil-doors.yml.
 * Vercel answering is encouraging; the runner answering is what decides,
 * since that is where the nightly ingest runs.
 *
 * Read-only: GET, no writes, no Supabase, no model calls. Plain text rather
 * than JSON because it is meant to be opened in a logged-in browser tab and
 * read, and the report IS the deliverable.
 */
export const maxDuration = 120;

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return new Response("unauthorized", { status: 403 });

  return new Response(renderDoorReport(await knockAllDoors(), "Vercel 服务器"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
