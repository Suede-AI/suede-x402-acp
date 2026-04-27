import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateVideo } from "../../kie-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const imageUrls = request.image_url ? [request.image_url] : [];

  const videoUrl = await generateVideo({
    prompt: request.prompt,
    duration: 8,
    aspectRatio: "9:16",   // vertical — optimized for social feeds
    mode: "std",           // faster for meme content
    sound: false,
    imageUrls,
  });

  return {
    deliverable: JSON.stringify({
      type: "video",
      videoUrl,
      duration: 8,
      model: "kling-3.0",
      category: "meme",
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A creative prompt is required for the meme video." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Creating an 8-second meme video: "${request.prompt.slice(0, 80)}". Please proceed with payment.`;
}
