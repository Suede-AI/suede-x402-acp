// =============================================================================
// general_video — Suede Labs AI video producer for agents needing a finished
// short clip from a text prompt. Default 16:9 / pro / sound on.
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";
import {
  requireString,
  optionalStringArray,
  optionalEnum,
  optionalBoolean,
} from "./_video-lib.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "general_video";

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
