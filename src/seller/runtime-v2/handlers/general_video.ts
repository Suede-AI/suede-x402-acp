// =============================================================================
// general_video — Suede Labs AI video producer for agents needing a finished
// short clip from a text prompt. Default 16:9 / pro / sound on.
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "general_video";

function requireString(req: Record<string, unknown>, field: string): string {
  const v = req[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  return v.trim();
}

function optionalStringArray(
  req: Record<string, unknown>,
  field: string
): string[] | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new Error(`Field ${field} must be an array of strings`);
  }
  const cleaned = v.filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  return cleaned.length > 0 ? cleaned : undefined;
}

function optionalEnum<T extends string>(
  req: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new Error(
      `Field ${field} must be one of: ${allowed.join(", ")}`
    );
  }
  return v as T;
}

function optionalBoolean(
  req: Record<string, unknown>,
  field: string
): boolean | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new Error(`Field ${field} must be a boolean`);
  }
  return v;
}

register(SERVICE_NAME, async (req) => {
  const prompt = requireString(req, "prompt");
  const opts: GenerateVideoOpts = {
    prompt,
    aspect_ratio: optionalEnum(req, "aspect_ratio", ["16:9", "9:16", "1:1"] as const) ?? "16:9",
    mode: optionalEnum(req, "mode", ["pro", "std"] as const) ?? "pro",
    sound: optionalBoolean(req, "sound") ?? true,
  };

  const imageUrls = optionalStringArray(req, "image_urls");
  if (imageUrls) opts.image_urls = imageUrls;

  const result = await generateVideo(opts);
  return JSON.stringify({
    type: "video_url",
    service: SERVICE_NAME,
    url: result.url,
    share_url: result.share_url,
    schemaVersion: SCHEMA_VERSION,
  });
});

// Exported for tests.
export const _testHelpers = {
  requireString,
  optionalStringArray,
  optionalEnum,
  optionalBoolean,
  SERVICE_NAME,
  SCHEMA_VERSION,
};
