import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { transcribeMidi } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await transcribeMidi({
    audioUrl: request.audio_url,
    instrument: request.instrument ?? "auto",
    quantize: request.quantize ?? "none",
  });

  return {
    deliverable: JSON.stringify({
      type: "audio",
      kind: "midi_transcription",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.audio_url || typeof request.audio_url !== "string") {
    return { valid: false, reason: "audio_url is required." };
  }
  const validInstruments = ["auto", "piano", "guitar", "bass", "drums", "vocals", "strings", "synth"];
  if (request.instrument && !validInstruments.includes(request.instrument)) {
    return { valid: false, reason: `instrument must be one of ${validInstruments.join(", ")}.` };
  }
  const validQuantize = ["none", "1/4", "1/8", "1/16", "1/32"];
  if (request.quantize && !validQuantize.includes(request.quantize)) {
    return { valid: false, reason: `quantize must be one of ${validQuantize.join(", ")}.` };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const inst = request.instrument ?? "auto";
  return `Transcribing audio to MIDI (instrument: ${inst}). Please proceed with payment.`;
}
