import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateVideo } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await generateVideo({
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    seed: request.seed,
  });

  return {
    deliverable: JSON.stringify({
      type: "video",
      kind: "suede_native",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A text prompt is required." };
  }
  if (
    request.durationSeconds !== undefined &&
    (typeof request.durationSeconds !== "number" ||
      request.durationSeconds < 4 ||
      request.durationSeconds > 30)
  ) {
    return { valid: false, reason: "durationSeconds must be between 4 and 30." };
  }
  if (request.aspectRatio && !["16:9", "9:16", "1:1"].includes(request.aspectRatio)) {
    return { valid: false, reason: "aspectRatio must be '16:9', '9:16', or '1:1'." };
  }
  if (request.resolution && !["720p", "1024p"].includes(request.resolution)) {
    return { valid: false, reason: "resolution must be '720p' or '1024p'." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  const dur = request.durationSeconds ?? 8;
  return `Generating a ${dur}-second Suede video: "${request.prompt.slice(0, 100)}". Please proceed with payment.`;
}
