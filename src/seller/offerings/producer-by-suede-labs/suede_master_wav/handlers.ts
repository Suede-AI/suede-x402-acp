import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { masterWav } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await masterWav({
    audioUrl: request.audio_url,
    targetLoudnessLufs: request.target_loudness_lufs ?? -14,
    outputFormat: request.output_format ?? "wav",
    preset: request.preset ?? "neutral",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "mastered",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (
    request.target_loudness_lufs !== undefined &&
    (typeof request.target_loudness_lufs !== "number" ||
      request.target_loudness_lufs < -23 ||
      request.target_loudness_lufs > -6)
  ) {
    return { valid: false, reason: "target_loudness_lufs must be between -23 and -6." };
  }
  if (request.output_format && !["wav", "flac", "mp3"].includes(request.output_format)) {
    return { valid: false, reason: "output_format must be 'wav', 'flac', or 'mp3'." };
  }
  const validPresets = ["neutral", "warm", "bright", "punchy", "vintage"];
  if (request.preset && !validPresets.includes(request.preset)) {
    return { valid: false, reason: `preset must be one of ${validPresets.join(", ")}.` };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const lufs = request.target_loudness_lufs ?? -14;
  return `Mastering audio to ${lufs} LUFS. Please proceed with payment.`;
}
