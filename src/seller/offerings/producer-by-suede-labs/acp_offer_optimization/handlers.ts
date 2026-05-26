import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_offer_optimization", {
    offering_name: request.offering_name,
    offering_description: request.offering_description,
    current_fee_usdc: request.current_fee_usdc,
    current_sla_minutes: request.current_sla_minutes,
    target_buyer: request.target_buyer,
    notes: request.notes,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_offer_optimization",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.offering_name || typeof request.offering_name !== "string" || !request.offering_name.trim()) {
    return { valid: false, reason: "offering_name is required." };
  }
  if (
    !request.offering_description ||
    typeof request.offering_description !== "string" ||
    request.offering_description.trim().length < 20
  ) {
    return { valid: false, reason: "offering_description is required and must be at least 20 characters." };
  }
  if (typeof request.current_fee_usdc !== "number" || request.current_fee_usdc < 0) {
    return { valid: false, reason: "current_fee_usdc is required and must be a non-negative number." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const name = String(request.offering_name ?? "your offering").slice(0, 60);
  return `Rewriting "${name}" for discoverability and conversion. Please proceed with payment.`;
}
