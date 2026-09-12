/**
 * Downloads one file, aborting on SILENCE rather than on elapsed time.
 *
 * Extracted from app/api/admin/documents/download/route.ts so the behaviour
 * can be tested against a server that actually trickles and actually stalls
 * (scripts/test-download-file.ts) — two real runs against Peru's SEACE had
 * already been lost to getting this wrong by reasoning alone.
 *
 * Why not a total-transfer deadline. Those runs measured ~110 KB/s per stream
 * from prod1.seace.gob.pe, where a single Bases Administrativas routinely
 * runs past 10MB. At a 20s deadline 1 of 3 files arrived; at 60s, 3 of 4
 * (23.1MB in 105s). Every one of the "timeouts" was a download working
 * normally — no fixed per-file deadline can separate "slow" from "broken"
 * when a healthy transfer legitimately needs two minutes. Silence can: the
 * clock resets on every chunk, so a slow file takes as long as it takes and a
 * dead connection is dropped promptly.
 *
 * `budgetMs` remains a hard stop, but it belongs to the CALLER's whole batch,
 * not to this file — and a transfer it ends is reported as "ran out of batch
 * time", which is a different fact from "stalled" and implies a different fix.
 */

export type DownloadOutcome =
  | { ok: true; bytes: number; buffer: Buffer }
  | { ok: false; bytes: number; error: string; reason: "stall" | "budget" | "http" | "empty" | "too-large" | "other" };

export type DownloadLimits = {
  /** Hard stop for this transfer — normally what is left of the caller's batch budget. */
  budgetMs: number;
  /** How long with no new bytes before the connection is treated as dead. */
  stallMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export async function downloadFile(url: string, limits: DownloadLimits): Promise<DownloadOutcome> {
  const controller = new AbortController();
  let abortedBy: "stall" | "budget" | null = null;
  let received = 0;

  const budgetTimer = setTimeout(() => {
    abortedBy = "budget";
    controller.abort();
  }, limits.budgetMs);
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      abortedBy = "stall";
      controller.abort();
    }, limits.stallMs);
  };

  try {
    // Armed before the request, so a server that accepts the connection and
    // then never answers is covered by the same clock as one that stalls
    // mid-body.
    armStallTimer();
    const response = await fetch(url, { headers: limits.headers, signal: controller.signal });
    if (!response.ok) {
      return { ok: false, bytes: 0, reason: "http", error: `HTTP ${response.status} ${response.statusText}` };
    }
    if (!response.body) return { ok: false, bytes: 0, reason: "empty", error: "响应没有内容" };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      // Checked while streaming, not after: the point of a size cap is to stop
      // spending time and memory on the file, which a check on the finished
      // buffer has already failed to do.
      if (received > limits.maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          bytes: received,
          reason: "too-large",
          error: `单个文件超过 ${Math.round(limits.maxBytes / 1024 / 1024)}MB，已跳过`,
        };
      }
      chunks.push(value);
      armStallTimer();
    }

    if (received === 0) return { ok: false, bytes: 0, reason: "empty", error: "空文件（0 字节）" };
    return { ok: true, bytes: received, buffer: Buffer.concat(chunks) };
  } catch (err) {
    if (abortedBy === "stall") {
      return {
        ok: false,
        bytes: received,
        reason: "stall",
        error: `连接卡住：收到 ${mb(received)} 后 ${Math.round(limits.stallMs / 1000)} 秒没有新数据——重试一次通常就好`,
      };
    }
    if (abortedBy === "budget") {
      return {
        ok: false,
        bytes: received,
        reason: "budget",
        error: `本批时间用完，这个文件只传了 ${mb(received)}——少选几个项目重试`,
      };
    }
    return { ok: false, bytes: received, reason: "other", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(budgetTimer);
    clearTimeout(stallTimer);
  }
}
