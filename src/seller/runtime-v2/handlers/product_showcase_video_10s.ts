// =============================================================================
// product_showcase_video_10s — premium tier of product_showcase_video.
// Forces duration_seconds: 10 and mode: "pro" regardless of caller input
// (the price tier IS the production polish).
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "product_showcase_video_10s";

const DEFAULT_PREMIUM_PROMPT =
  "Premium cinematic product showcase with smooth orbiting camera, dramatic lighting, and attention to detail";

function optionalString(
  req: Record<string, unknown>,
  field: string
): string | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    throw new Error(`Field ${field} must be a string`);
  }
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function requireImageRef(
  req: Record<string, unknown>
): { image_url?: string; image_urls?: string[] } {
  const single = optionalString(req, "image_url");
  const multi = optionalStringArray(req, "image_urls");
  if (!single && (!multi || multi.length === 0)) {
    throw new Error(
      "At least one of image_url or image_urls is required for product_showcase variants"
    );
  }
  return { image_url: single, image_urls: multi };
}

register(SERVICE_NAME, async (req) => {
  const images = requireImageRef(req);
  const prompt = optionalString(req, "prompt") ?? DEFAULT_PREMIUM_PROMPT;

  // Premium tier: 10s duration + pro mode are FORCED. Aspect ratio + sound
  // are still respectable defaults but caller can override them.
  const opts: GenerateVideoOpts = {
    prompt,
    duration_seconds: 10,
    mode: "pro",
    aspect_ratio: optionalEnum(req, "aspect_ratio", ["16:9", "9:16", "1:1"] as const) ?? "16:9",
    sound: optionalBoolean(req, "sound") ?? false,
  };
  if (images.image_url) opts.image_url = images.image_url;
  if (images.image_urls) opts.image_urls = images.image_urls;

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
  optionalString,
  optionalStringArray,
  optionalEnum,
  optionalBoolean,
  requireImageRef,
  SERVICE_NAME,
  SCHEMA_VERSION,
  DEFAULT_PREMIUM_PROMPT,
};
