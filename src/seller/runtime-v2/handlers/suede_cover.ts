// =============================================================================
// suede_cover — re-record a source track in a different style/genre.
//
// Schema requires `style_prompt` and at least one of `track_id` or `audio_url`.
// Backend /v1/cover not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { coverTrack } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalBoolean,
  optionalString,
  requireOneOfString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_cover";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const stylePrompt = requireString(req, "style_prompt");
  // Schema requires style_prompt; track_id or audio_url is required to identify the source.
  requireOneOfString(req, ["audio_url", "track_id"]);
  const trackId = optionalString(req, "track_id");
  const audioUrl = optionalString(req, "audio_url");
  const preserveVocals = optionalBoolean(req, "preserve_vocals");

  try {
    const result = await coverTrack({
      ...(trackId ? { trackId } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      stylePrompt,
      ...(preserveVocals !== undefined ? { preserveVocals } : {}),
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
