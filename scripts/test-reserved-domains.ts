/**
 * Both directions matter. Skipping too much silently drops a paying
 * customer's mail; skipping too little puts the permanently-red alert back.
 *
 * Usage: npm run test:reserved-domains
 */
import { isReservedEmailDomain } from "../lib/notifications/reserved-domains";

const RESERVED: string[] = [
  // The five real QA accounts whose failures prompted this.
  "qa-ent-member@example.com",
  "qa-ent-owner@example.com",
  "qa-pro@example.com",
  "qa-free@example.com",
  "qa-trial@example.com",
  "someone@example.net",
  "someone@example.org",
  "SOMEONE@EXAMPLE.COM", // case
  "  spaced@example.com  ", // trimming
  "a@host.test",
  "a@anything.invalid",
  "a@localhost",
  "a@box.localhost",
  "a@sub.example", // the .example TLD, not example.com
];

const DELIVERABLE: string[] = [
  "shangwei.leo@gmail.com",
  "aviso@latintender.com",
  // The trap: a real domain that merely CONTAINS a reserved label.
  "a@example.com.mx",
  "a@myexample.com",
  "a@exampleshop.com",
  "a@test-lab.com",
  "a@contest.com", // ends with "test" but not ".test"
  "a@invalidation.io",
  "a@localhost.com",
  "",
  "no-at-sign",
];

let failures = 0;
console.log("应当跳过（保留域名，永远收不到信）");
for (const email of RESERVED) {
  const ok = isReservedEmailDomain(email);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${JSON.stringify(email)}`);
}
console.log("\n应当照常投递");
for (const email of DELIVERABLE) {
  const ok = !isReservedEmailDomain(email);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${JSON.stringify(email)}`);
}

const total = RESERVED.length + DELIVERABLE.length;
console.log(`\n${total - failures}/${total} checks passed.`);
if (failures > 0) process.exit(1);
