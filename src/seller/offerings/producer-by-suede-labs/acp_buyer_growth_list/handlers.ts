import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_buyer_growth_list", {
    seller_agent_url: request.seller_agent_url,
    offerings_summary: request.offerings_summary,
    ideal_buyer_hint: request.ideal_buyer_hint,
    exclusions: request.exclusions,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_buyer_growth_list",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (
    !request.seller_agent_url ||
    typeof request.seller_agent_url !== "string" ||
    !request.seller_agent_url.trim()
  ) {
    return { valid: false, reason: "seller_agent_url is required." };
  }
  if (!request.seller_agent_url.startsWith("http")) {
    return { valid: false, reason: "seller_agent_url must be a valid HTTP(S) URL." };
  }
  if (
    !request.offerings_summary ||
    typeof request.offerings_summary !== "string" ||
    request.offerings_summary.trim().length < 20
  ) {
    return { valid: false, reason: "offerings_summary is required and must be at least 20 characters." };
  }
  if (request.exclusions && !Array.isArray(request.exclusions)) {
    return { valid: false, reason: "exclusions must be an array of strings." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Generating a 20+ entry buyer growth list for the seller's offerings. Please proceed with payment.";
}
