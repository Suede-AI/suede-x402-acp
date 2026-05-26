// =============================================================================
// suede_lyric_sync — generate timed/synced lyrics (LRC) from audio + lyrics.
//
// Schema requires both `audio_url` and `lyrics`. Backend /v1/lyric-sync not
// yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { syncLyrics } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_lyric_sync";

type LyricSyncFormat = "lrc" | "enhanced_lrc" | "json" | "vtt";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const lyrics = requireString(req, "lyrics");
  const language = optionalString(req, "language");
  const format = optionalString(req, "format");

  try {
    const result = await syncLyrics({
      audioUrl,
      lyrics,
      ...(language ? { language } : {}),
      ...(format ? { format: format as LyricSyncFormat } : {}),
    });

    return JSON.stringify({
      type: "lrc_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
