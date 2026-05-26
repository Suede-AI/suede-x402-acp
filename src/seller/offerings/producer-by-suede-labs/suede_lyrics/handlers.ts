import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";
import { generateLyrics } from "../../music-client.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await generateLyrics({
    prompt: request.prompt,
    language: request.language ?? "en",
    structure: request.structure ?? "verse-chorus-verse-chorus-bridge-chorus",
    rhyme_scheme: request.rhyme_scheme ?? "auto",
    explicit_allowed: request.explicit_allowed ?? false,
  });

  return {
    deliverable: JSON.stringify({
      type: "text",
      kind: "lyrics",
      result,
    }),
  };
}

export function validateRequirements(request: any): ValidationResult {
  if (!request.prompt || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "A text prompt is required." };
  }
  const validRhyme = ["auto", "abab", "aabb", "abba", "free"];
  if (request.rhyme_scheme && !validRhyme.includes(request.rhyme_scheme)) {
    return { valid: false, reason: `rhyme_scheme must be one of ${validRhyme.join(", ")}.` };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Writing lyrics: "${request.prompt.slice(0, 80)}". Please proceed with payment.`;
}
