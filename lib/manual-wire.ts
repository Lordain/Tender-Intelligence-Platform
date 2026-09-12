/** The site only collects a contact request. Bank details stay off-platform. */
export function internationalWireEnabled(): boolean {
  return process.env.INTERNATIONAL_WIRE_ENABLED?.trim().toLowerCase() === "true";
}
