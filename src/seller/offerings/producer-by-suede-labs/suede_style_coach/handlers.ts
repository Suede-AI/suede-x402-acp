import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { coachStyle } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await coachStyle({
    prompt: request.prompt,
    targetUse: request.target_use ?? "music_generation",
    maxTokens: request.max_tokens ?? 80,
  });

  return {
    deliverable: JSON.stringify({
      type: "text",
      kind: "style_coach",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A prompt is required." };
  }
  const validTargets = ["music_generation", "cover", "continuation", "catalog_tagging", "search"];
  if (request.target_use && !validTargets.includes(request.target_use)) {
    return { valid: false, reason: `target_use must be one of ${validTargets.join(", ")}.` };
  }
  if (
    request.max_tokens !== undefined &&
    (typeof request.max_tokens !== "number" ||
      request.max_tokens < 16 ||
      request.max_tokens > 200)
  ) {
    return { valid: false, reason: "max_tokens must be between 16 and 200." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Expanding style prompt: "${request.prompt.slice(0, 80)}". Please proceed with payment.`;
}
