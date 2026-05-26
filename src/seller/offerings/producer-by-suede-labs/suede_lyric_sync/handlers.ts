import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { syncLyrics } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await syncLyrics({
    audioUrl: request.audio_url,
    lyrics: request.lyrics,
    language: request.language,
    format: request.format ?? "enhanced_lrc",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "lyric_sync",
      format: request.format ?? "enhanced_lrc",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  if (!request.lyrics || typeof request.lyrics !== "string" || !request.lyrics.trim()) {
    return { valid: false, reason: "lyrics is required." };
  }
  if (request.format && !["lrc", "enhanced_lrc", "json", "vtt"].includes(request.format)) {
    return { valid: false, reason: "format must be 'lrc', 'enhanced_lrc', 'json', or 'vtt'." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const format = request.format ?? "enhanced_lrc";
  return `Aligning lyrics to audio (output: ${format}). Please proceed with payment.`;
}
