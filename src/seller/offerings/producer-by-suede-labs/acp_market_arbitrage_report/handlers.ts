import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_market_arbitrage_report", {
    categories: request.categories,
    buyer_perspective: request.buyer_perspective,
    seller_perspective: request.seller_perspective,
    notes: request.notes,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_market_arbitrage_report",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!Array.isArray(request.categories) || request.categories.length === 0) {
    return { valid: false, reason: "categories is required and must be a non-empty array of strings." };
  }
  if (!request.categories.every((c: any) => typeof c === "string" && c.trim().length > 0)) {
    return { valid: false, reason: "Every entry in categories must be a non-empty string." };
  }
  if (request.categories.length > 6) {
    return { valid: false, reason: "categories supports at most 6 entries." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const count = Array.isArray(request.categories) ? request.categories.length : 0;
  return `Surveying ${count} ACP categories for arbitrage. Please proceed with payment.`;
}
