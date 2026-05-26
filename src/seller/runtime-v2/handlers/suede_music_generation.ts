// =============================================================================
// suede_music_generation — original MP3 track from a text prompt.
//
// LIVE: hits /api/agent/generate via SUEDE_API_KEY. Other handlers in this
// directory throw BACKEND_UNAVAILABLE until backend routes ship.
// =============================================================================

import { register } from "../dispatch.js";
import { generateMusic } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  mapBackendError,
  optionalBoolean,
  optionalIntegerInRange,
  optionalString,
  requireString,
  resolveMusicUrl,
  HandlerError,
  ERROR_CODES,
} from "./_lib.js";

const OFFERING = "suede_music_generation";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const prompt = requireString(req, "prompt");
  const durationSeconds = optionalIntegerInRange(req, "durationSeconds", 5, 120);
  const style = optionalString(req, "style");
  const makeInstrumental = optionalBoolean(req, "make_instrumental");
  const customMode = optionalBoolean(req, "custom_mode");
  const lyrics = optionalString(req, "lyrics");
  const vocalGender = optionalString(req, "vocal_gender");
  const tags = optionalString(req, "tags");

  if (customMode === true && !lyrics) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      "lyrics is required when custom_mode is true"
    );
  }
  if (vocalGender !== undefined && vocalGender !== "m" && vocalGender !== "f") {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      "vocal_gender must be 'm' or 'f'"
    );
  }

  try {
    const result = await generateMusic({
      prompt,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(style ? { style } : {}),
      ...(makeInstrumental !== undefined ? { make_instrumental: makeInstrumental } : {}),
      ...(customMode !== undefined ? { custom_mode: customMode } : {}),
      ...(lyrics ? { lyrics } : {}),
      ...(vocalGender ? { vocal_gender: vocalGender as "m" | "f" } : {}),
      ...(tags ? { tags } : {}),
    });

    const url = resolveMusicUrl(result);

    return JSON.stringify({
      type: "audio_url",
      service: OFFERING,
      url,
      ...(result.title ? { title: result.title } : {}),
      ...(result.shareUrl ? { share_url: result.shareUrl } : {}),
      ...(result.trackId ? { track_id: result.trackId } : {}),
      ...(result.imageUrl ? { image_url: result.imageUrl } : {}),
      ...(result.provenance ? { provenance: result.provenance } : {}),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
