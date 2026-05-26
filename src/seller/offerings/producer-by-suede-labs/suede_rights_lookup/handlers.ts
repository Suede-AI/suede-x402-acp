import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { lookupRights } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await lookupRights({
    assetHash: request.asset_hash,
    includeLicense: request.include_license ?? false,
  });

  return {
    deliverable: JSON.stringify({
      type: "rights",
      kind: "attestation_lookup",
      assetHash: request.asset_hash,
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.asset_hash || typeof request.asset_hash !== "string") {
    return { valid: false, reason: "asset_hash is required." };
  }
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(request.asset_hash)) {
    return { valid: false, reason: "asset_hash must be a 64-char hex digest (with optional 0x prefix)." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const hash = request.asset_hash.slice(0, 12);
  return `Resolving Suede Registry attestation for ${hash}... Please proceed with payment.`;
}
