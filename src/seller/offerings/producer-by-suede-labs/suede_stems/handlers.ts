import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { extractStems } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await extractStems({
    audioUrl: request.audio_url,
    mode: request.mode ?? "vocal_inst",
    outputFormat: request.output_format ?? "mp3",
    tier: "basic",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "stems_basic_2track",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (request.mode && !["vocal_inst", "drum_other"].includes(request.mode)) {
    return { valid: false, reason: "mode must be 'vocal_inst' or 'drum_other'." };
  }
  if (request.output_format && !["wav", "mp3", "flac"].includes(request.output_format)) {
    return { valid: false, reason: "output_format must be 'wav', 'mp3', or 'flac'." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const mode = request.mode ?? "vocal_inst";
  return `Producing 2-track stems (${mode}). Please proceed with payment.`;
}
