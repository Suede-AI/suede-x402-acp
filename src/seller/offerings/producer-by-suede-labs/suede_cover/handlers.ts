import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { coverTrack } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await coverTrack({
    trackId: request.track_id,
    audioUrl: request.audio_url,
    stylePrompt: request.style_prompt,
    preserveVocals: request.preserve_vocals,
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "cover",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.style_prompt || typeof request.style_prompt !== "string") {
    return { valid: false, reason: "style_prompt is required." };
  }
  if (!request.track_id && !request.audio_url) {
    return { valid: false, reason: "Provide either track_id or audio_url." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Covering track in style: "${request.style_prompt.slice(0, 80)}". Please proceed with payment.`;
}
