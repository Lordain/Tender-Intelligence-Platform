/**
 * supabase-js does not throw on a failed write — it resolves with
 * `{ error }`. An unchecked write is therefore indistinguishable from a
 * successful one at the call site, which is how this codebase managed to
 * report "已写入" (and requirement counts) for analysis data that never
 * landed.
 *
 * It matters most on the delete-then-insert pattern used to replace a
 * tender's requirements/risks/key dates: there, a silently failed insert
 * doesn't merely skip an update, it leaves the tender with NOTHING where
 * a good previous result used to be — and still reports success. Every
 * write on those paths goes through here.
 *
 * Deliberately dependency-free (no "server-only", no Supabase import):
 * it is called both from Next.js server code and from the standalone
 * scripts/*.ts run under tsx.
 */
export function assertWritten(what: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`${what} 写入失败：${result.error.message}`);
}
