import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { runConsultingAnalysis } from "../../acp-consulting-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const report = await runConsultingAnalysis("acp_agent_setup", {
    agent_concept: request.agent_concept,
    preferred_name: request.preferred_name,
    target_buyer: request.target_buyer,
    infra_state: request.infra_state,
    constraints: request.constraints,
  });

  return {
    deliverable: JSON.stringify({
      type: "markdown",
      service: "acp_agent_setup",
      content: report,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (
    !request.agent_concept ||
    typeof request.agent_concept !== "string" ||
    request.agent_concept.trim().length < 30
  ) {
    return {
      valid: false,
      reason: "agent_concept is required and must be at least 30 characters describing what the agent does.",
    };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Writing a full end-to-end ACP agent setup guide (positioning, offerings, pricing, copy, infra, day 1-7 plan). Please proceed with payment.";
}
