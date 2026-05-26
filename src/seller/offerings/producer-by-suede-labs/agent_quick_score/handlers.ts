import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("agent_quick_score", {
    agent_url: request.agent_url,
    agent_name: request.agent_name,
    notes: request.notes,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "agent_quick_score",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.agent_url || typeof request.agent_url !== "string" || !request.agent_url.trim()) {
    return { valid: false, reason: "agent_url is required." };
  }
  if (!request.agent_url.startsWith("http")) {
    return { valid: false, reason: "agent_url must be a valid HTTP(S) URL." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Generating a 1-page rapid scorecard for the target Virtuals agent. Please proceed with payment.";
}
