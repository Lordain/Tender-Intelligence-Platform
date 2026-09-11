/**
 * Behaviour tests for lib/ingestion/download-file.ts, against a real HTTP
 * server that really trickles and really stalls.
 *
 * This exists because the ceiling on tender-document downloads was got wrong
 * twice by reasoning about it instead of measuring it, and both times the
 * cost was a real run against Peru's SEACE reporting healthy downloads as
 * failures. The first case below is the whole point: a transfer slower than
 * any fixed per-file deadline, which must still succeed.
 *
 * No network: the server is local, so this runs anywhere `npm run lint` does.
 *
 * Usage: npm run test:download
 */
import { createServer, type Server } from "node:http";
import { downloadFile } from "../lib/ingestion/download-file";

type Route = (respond: {
  write: (chunk: Buffer | string) => void;
  end: () => void;
  status: (code: number) => void;
}) => void;

let route: Route = ({ end }) => end();

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const server = createServer((req, res) => {
    route({
      write: (chunk) => res.write(chunk),
      end: () => res.end(),
      status: (code) => res.writeHead(code),
    });
  });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/file`;

  // 1. The case every fixed per-file deadline gets wrong: a transfer that is
  //    healthy but slower than the deadline would allow. 20 chunks at 100ms
  //    apart is 2s of transfer under a 400ms stall limit — no gap ever
  //    exceeds the limit, so it must complete.
  route = async ({ write, end }) => {
    for (let i = 0; i < 20; i++) {
      write(Buffer.alloc(50_000, 1));
      await sleep(100);
    }
    end();
  };
  const slow = await downloadFile(url, { budgetMs: 10_000, stallMs: 400, maxBytes: 50 * 1024 * 1024 });
  check("a slow but steady transfer completes", slow.ok && slow.bytes === 1_000_000, JSON.stringify(slow).slice(0, 160));

  // 2. A connection that delivers and then goes silent is dropped, and the
  //    error reports how much did arrive.
  route = async ({ write }) => {
    write(Buffer.alloc(30_000, 1));
    // never ends
  };
  const stalledAt = Date.now();
  const stalled = await downloadFile(url, { budgetMs: 10_000, stallMs: 400, maxBytes: 50 * 1024 * 1024 });
  const stalledAfter = Date.now() - stalledAt;
  check("a stalled transfer aborts", !stalled.ok && stalled.reason === "stall", JSON.stringify(stalled).slice(0, 160));
  check("it aborts promptly, not after the whole budget", stalledAfter < 2_000, `took ${stalledAfter}ms of a 10000ms budget`);
  check("the error names the bytes received", !stalled.ok && stalled.bytes === 30_000, `bytes=${stalled.bytes}`);

  // 3. The batch budget is still a hard stop, and is reported as its own
  //    distinct reason — "you selected too many" needs a different fix from
  //    "that one connection died".
  route = async ({ write }) => {
    for (let i = 0; i < 200; i++) {
      write(Buffer.alloc(10_000, 1));
      await sleep(50);
    }
  };
  const outOfBudget = await downloadFile(url, { budgetMs: 600, stallMs: 5_000, maxBytes: 50 * 1024 * 1024 });
  check("running out of batch budget is its own reason", !outOfBudget.ok && outOfBudget.reason === "budget", JSON.stringify(outOfBudget).slice(0, 160));

  // 4. The size cap stops the transfer instead of measuring the finished file.
  route = async ({ write }) => {
    for (let i = 0; i < 200; i++) {
      write(Buffer.alloc(100_000, 1));
      await sleep(5);
    }
  };
  const tooLarge = await downloadFile(url, { budgetMs: 10_000, stallMs: 2_000, maxBytes: 250_000 });
  check("an oversized file is cut off while streaming", !tooLarge.ok && tooLarge.reason === "too-large", JSON.stringify(tooLarge).slice(0, 160));
  check("it stops near the cap rather than downloading everything", !tooLarge.ok && tooLarge.bytes < 1_000_000, `bytes=${tooLarge.bytes}`);

  // 5. A non-200 is an HTTP failure, not a timeout.
  route = ({ status, end }) => {
    status(403);
    end();
  };
  const forbidden = await downloadFile(url, { budgetMs: 10_000, stallMs: 2_000, maxBytes: 50 * 1024 * 1024 });
  check("a 403 reports as HTTP, not as a stall", !forbidden.ok && forbidden.reason === "http", JSON.stringify(forbidden).slice(0, 160));

  // 6. An empty 200 is distinguishable from a failure to connect.
  route = ({ end }) => end();
  const empty = await downloadFile(url, { budgetMs: 10_000, stallMs: 2_000, maxBytes: 50 * 1024 * 1024 });
  check("an empty body reports as empty", !empty.ok && empty.reason === "empty", JSON.stringify(empty).slice(0, 160));

  server.closeAllConnections?.();
  server.close();

  console.log(`\n${passed}/${passed + failed} checks passed.`);
  if (failed > 0) process.exit(1);
}

main();
