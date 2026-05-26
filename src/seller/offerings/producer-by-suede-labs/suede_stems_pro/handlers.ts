import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { extractStems } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await extractStems({
    audioUrl: request.audio_url,
    outputFormat: request.output_format ?? "wav",
    sampleRate: request.sample_rate ?? 44100,
    tier: "pro",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "stems_pro_4track",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (request.output_format && !["wav", "mp3", "flac"].includes(request.output_format)) {
    return { valid: false, reason: "output_format must be 'wav', 'mp3', or 'flac'." };
  }
  if (request.sample_rate && ![44100, 48000].includes(request.sample_rate)) {
    return { valid: false, reason: "sample_rate must be 44100 or 48000." };
  }
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Producing 4-track pro stems (vocals/drums/bass/melody). Please proceed with payment.";
}
