import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateMusic } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await generateMusic({
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    style: request.style,
    make_instrumental: request.make_instrumental,
    custom_mode: request.custom_mode,
    lyrics: request.lyrics,
    vocal_gender: request.vocal_gender,
    tags: request.tags,
  });

  return {
    deliverable: JSON.stringify({
      type: "music",
      trackId: result.trackId,
      shareUrl: result.shareUrl,
      assetUrl: result.assetUrl,
      title: result.title,
      imageUrl: result.imageUrl,
      provenance: result.provenance,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A text prompt is required." };
  }
  if (request.custom_mode === true && !request.lyrics) {
    return { valid: false, reason: "lyrics must be provided when custom_mode is true." };
  }
  if (
    request.durationSeconds !== undefined &&
    (typeof request.durationSeconds !== "number" ||
      request.durationSeconds < 5 ||
      request.durationSeconds > 120)
  ) {
    return { valid: false, reason: "durationSeconds must be between 5 and 120." };
  }
  if (request.vocal_gender && !["m", "f"].includes(request.vocal_gender)) {
    return { valid: false, reason: "vocal_gender must be 'm' or 'f'." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Generating original Suede music: "${request.prompt.slice(0, 100)}". Please proceed with payment.`;
}
