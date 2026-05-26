import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { continueTrack } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await continueTrack({
    audioUrl: request.audio_url,
    prompt: request.prompt,
    durationSeconds: request.duration_seconds ?? 60,
    sectionHint: request.section_hint ?? "auto",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "continuation",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (
    request.duration_seconds !== undefined &&
    (typeof request.duration_seconds !== "number" ||
      request.duration_seconds < 10 ||
      request.duration_seconds > 240)
  ) {
    return { valid: false, reason: "duration_seconds must be between 10 and 240." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const dur = request.duration_seconds ?? 60;
  return `Continuing audio for ${dur}s with section hint "${request.section_hint ?? "auto"}". Please proceed with payment.`;
}
