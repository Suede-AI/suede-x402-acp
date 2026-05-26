import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { voiceCover } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await voiceCover({
    audioUrl: request.audio_url,
    voiceId: request.voice_id,
    referenceVoiceUrl: request.reference_voice_url,
    rightsAttestation: request.rights_attestation,
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "voice_cover",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (!request.voice_id && !request.reference_voice_url) {
    return { valid: false, reason: "Provide either voice_id or reference_voice_url." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const voiceLabel = request.voice_id ?? "supplied reference voice";
  return `Voice-covering audio with ${voiceLabel}. Caller is responsible for vocal rights. Please proceed with payment.`;
}
