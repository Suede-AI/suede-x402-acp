import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { analyzeAudio } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await analyzeAudio({
    audioUrl: request.audio_url,
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "analysis",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  try {
    const u = new URL(request.audio_url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { valid: false, reason: "audio_url must be an HTTP(S) URL." };
    }
  } catch {
    return { valid: false, reason: "audio_url must be a valid URL." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Analyzing audio for BPM, key, mode, energy, and danceability. Please proceed with payment.";
}
