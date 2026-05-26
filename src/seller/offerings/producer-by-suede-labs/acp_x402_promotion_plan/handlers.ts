import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_x402_promotion_plan", {
    endpoint_url: request.endpoint_url,
    what_it_does: request.what_it_does,
    price_usdc: request.price_usdc,
    current_traction: request.current_traction,
    constraints: request.constraints,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_x402_promotion_plan",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.endpoint_url || typeof request.endpoint_url !== "string" || !request.endpoint_url.trim()) {
    return { valid: false, reason: "endpoint_url is required." };
  }
  if (!request.endpoint_url.startsWith("http")) {
    return { valid: false, reason: "endpoint_url must be a valid HTTP(S) URL." };
  }
  if (
    !request.what_it_does ||
    typeof request.what_it_does !== "string" ||
    request.what_it_does.trim().length < 20
  ) {
    return { valid: false, reason: "what_it_does is required and must be at least 20 characters." };
  }
  if (typeof request.price_usdc !== "number" || request.price_usdc < 0) {
    return { valid: false, reason: "price_usdc is required and must be a non-negative number." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Building a tailored 14-day x402 / Bazaar promotion plan. Please proceed with payment.";
}
