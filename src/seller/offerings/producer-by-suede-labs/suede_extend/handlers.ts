import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { extendTrack } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await extendTrack({
    trackId: request.track_id,
    audioUrl: request.audio_url,
    durationSeconds: request.duration_seconds,
    prompt: request.prompt,
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "extension",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.track_id && !request.audio_url) {
    return { valid: false, reason: "Provide either track_id or audio_url." };
  }
  if (
    typeof request.duration_seconds !== "number" ||
    request.duration_seconds < 5 ||
    request.duration_seconds > 240
  ) {
    return { valid: false, reason: "duration_seconds must be between 5 and 240." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const source = request.track_id ?? request.audio_url ?? "track";
  return `Extending ${source} by ${request.duration_seconds}s. Please proceed with payment.`;
}
