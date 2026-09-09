import "server-only";

export type InternationalWireInstructions = {
  provider: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  routing: string | null;
  swift: string;
  bankAddress: string | null;
  beneficiaryAddress: string | null;
};

function value(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getInternationalWireInstructions(): InternationalWireInstructions | null {
  if (value("INTERNATIONAL_WIRE_ENABLED").toLowerCase() !== "true") return null;
  const instructions = {
    provider: value("INTERNATIONAL_WIRE_PROVIDER"),
    beneficiaryName: value("INTERNATIONAL_WIRE_BENEFICIARY_NAME"),
    bankName: value("INTERNATIONAL_WIRE_BANK_NAME"),
    accountNumber: value("INTERNATIONAL_WIRE_ACCOUNT_NUMBER"),
    routing: value("INTERNATIONAL_WIRE_ROUTING") || null,
    swift: value("INTERNATIONAL_WIRE_SWIFT"),
    bankAddress: value("INTERNATIONAL_WIRE_BANK_ADDRESS") || null,
    beneficiaryAddress: value("INTERNATIONAL_WIRE_BENEFICIARY_ADDRESS") || null,
  };
  if (!instructions.provider || !instructions.beneficiaryName || !instructions.bankName || !instructions.accountNumber || !instructions.swift) {
    console.error("[manual-wire] Enabled, but required receiving-account fields are incomplete.");
    return null;
  }
  return instructions;
}

export function internationalWireEnabled(): boolean {
  return getInternationalWireInstructions() !== null;
}

