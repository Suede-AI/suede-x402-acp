import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { extractAcapella } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await extractAcapella({
    audioUrl: request.audio_url,
    outputFormat: request.output_format ?? "wav",
    denoise: request.denoise ?? true,
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "acapella",
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
  return { valid: true };
}

export function requestPayment(_request: any): string {
  return "Extracting isolated vocal acapella. Please proceed with payment.";
}
