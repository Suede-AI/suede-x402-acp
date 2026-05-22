import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateVideo } from "../../video-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const prompt = request.prompt?.trim()
    || "Premium cinematic product showcase with smooth orbiting camera, dramatic lighting, and attention to detail";

  const videoUrl = await generateVideo({
    prompt,
    duration: 10,
    aspectRatio: "16:9",
    mode: "pro",        // high quality for product content
    sound: false,
    imageUrls: [request.image_url],
  });

  return {
    deliverable: JSON.stringify({
      type: "video",
      videoUrl,
      duration: 10,
      model: "server-side-video",
      category: "product_showcase",
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.image_url || typeof request.image_url !== "string" || !request.image_url.trim()) {
    return { valid: false, reason: "A product image URL is required." };
  }
  if (!request.image_url.startsWith("http")) {
    return { valid: false, reason: "image_url must be a valid HTTP(S) URL." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return "Creating a 10-second premium product showcase video from your image. Please proceed with payment.";
}
