// =============================================================================
// suede_extend — lengthen an existing track.
//
// Schema requires either `track_id` or `audio_url` to identify the source,
// plus `duration_seconds`. Backend /v1/extend not yet deployed — handler
// throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { extendTrack } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalIntegerInRange,
  optionalString,
  requireOneOfString,
  HandlerError,
  ERROR_CODES,
} from "./_lib.js";

const OFFERING = "suede_extend";

export async function handle(req: Record<string, unknown>): Promise<string> {
  // Either track_id OR audio_url is required by the schema; duration_seconds
  // is also required (5..240).
  requireOneOfString(req, ["audio_url", "track_id"]);
  const trackId = optionalString(req, "track_id");
  const audioUrl = optionalString(req, "audio_url");

  const durationSeconds = optionalIntegerInRange(req, "duration_seconds", 5, 240);
  if (durationSeconds === undefined) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      "Missing required field: duration_seconds (5-240)"
    );
  }

  const prompt = optionalString(req, "prompt");

  try {
    const result = await extendTrack({
      ...(trackId ? { trackId } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      durationSeconds,
      ...(prompt ? { prompt } : {}),
    });

    return JSON.stringify({
      type: "audio_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
