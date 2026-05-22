import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateVideo } from "../../video-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const videoUrl = await generateVideo({
    prompt: request.prompt,
    duration: 10,
    aspectRatio: request.aspect_ratio ?? "16:9",
    mode: request.mode ?? "pro",
    sound: request.sound ?? true,
    imageUrls: request.image_urls ?? [],
  });

  return {
    deliverable: JSON.stringify({
      type: "video",
      videoUrl,
      duration: 10,
      model: "server-side-video",
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A text prompt is required." };
  }
  if (request.mode && !["pro", "std"].includes(request.mode)) {
    return { valid: false, reason: "Mode must be 'pro' or 'std'." };
  }
  if (request.aspect_ratio && !["16:9", "9:16", "1:1"].includes(request.aspect_ratio)) {
    return { valid: false, reason: "Aspect ratio must be '16:9', '9:16', or '1:1'." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Generating a 10-second video: "${request.prompt.slice(0, 100)}". Please proceed with payment.`;
}
