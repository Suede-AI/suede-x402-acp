import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_performance_audit", {
    agent_url: request.agent_url,
    agent_uuid: request.agent_uuid,
    focus_areas: request.focus_areas,
    notes: request.notes,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_performance_audit",
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
  if (request.focus_areas && !Array.isArray(request.focus_areas)) {
    return { valid: false, reason: "focus_areas must be an array of strings." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Running a deep ACP performance audit. Expect a structured markdown memo within the SLA window. Please proceed with payment.";
}
