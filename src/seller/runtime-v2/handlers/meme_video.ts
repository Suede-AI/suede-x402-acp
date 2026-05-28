// =============================================================================
// meme_video — Suede Labs meme-format short clip. Forces 9:16 / std / sound on
// unless the caller explicitly overrides; meme format is the whole point.
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";
import {
  requireString,
  optionalString,
  optionalEnum,
  optionalBoolean,
} from "./_video-lib.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "meme_video";

register(SERVICE_NAME, async (req) => {
  const prompt = requireString(req, "prompt");

  // Meme defaults: 9:16, std mode, sound on. Overridable.
  const opts: GenerateVideoOpts = {
    prompt,
    aspect_ratio: optionalEnum(req, "aspect_ratio", ["16:9", "9:16", "1:1"] as const) ?? "9:16",
    mode: optionalEnum(req, "mode", ["pro", "std"] as const) ?? "std",
    sound: optionalBoolean(req, "sound") ?? true,
  };

  // Optional starting image — single image_url per the offering schema.
  const imageUrl = optionalString(req, "image_url");
  if (imageUrl) opts.image_url = imageUrl;

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
  optionalString,
  optionalEnum,
  optionalBoolean,
  SERVICE_NAME,
  SCHEMA_VERSION,
};
