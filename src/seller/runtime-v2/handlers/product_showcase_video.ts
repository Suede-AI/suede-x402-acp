// =============================================================================
// product_showcase_video — Prompt + at least one image (image_url OR image_urls)
// → finished short product clip. Default 16:9 / pro / sound off (product
// videos are usually paired with marketing copy or run muted in autoplay).
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
const SERVICE_NAME = "product_showcase_video";

const DEFAULT_PRODUCT_PROMPT =
  "Cinematic product showcase with smooth camera movement and professional lighting";

register(SERVICE_NAME, async (req) => {
  const images = requireImageRef(req);
  const prompt = optionalString(req, "prompt") ?? DEFAULT_PRODUCT_PROMPT;

  const opts: GenerateVideoOpts = {
    prompt,
    aspect_ratio: optionalEnum(req, "aspect_ratio", ["16:9", "9:16", "1:1"] as const) ?? "16:9",
    mode: optionalEnum(req, "mode", ["pro", "std"] as const) ?? "pro",
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

// Exported for tests + reuse by product_showcase_video_10s.
export const _testHelpers = {
  optionalString,
  optionalStringArray,
  optionalEnum,
  optionalBoolean,
  requireImageRef,
  SERVICE_NAME,
  SCHEMA_VERSION,
  DEFAULT_PRODUCT_PROMPT,
};
