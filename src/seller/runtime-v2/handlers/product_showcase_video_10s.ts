// =============================================================================
// product_showcase_video_10s — premium tier of product_showcase_video.
// Forces duration_seconds: 10 and mode: "pro" regardless of caller input
// (the price tier IS the production polish).
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";
import {
  optionalString,
  optionalStringArray,
  optionalEnum,
  optionalBoolean,
  requireImageRef,
} from "./_video-lib.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "product_showcase_video_10s";

const DEFAULT_PREMIUM_PROMPT =
  "Premium cinematic product showcase with smooth orbiting camera, dramatic lighting, and attention to detail";

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
