// =============================================================================
// suede_audio_analyze — return structured JSON (key, tempo, energy, mood,
// instruments) for an input audio URL.
//
// LIVE-ish: backend /v1/analyze exists as a public x402 route. There is no
// internal-API counterpart yet, so the client throws
// SuedeInternalRouteMissingError (mapped to BACKEND_UNAVAILABLE).
// =============================================================================

import { register } from "../dispatch.js";
import { analyzeAudio } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  mapBackendError,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_audio_analyze";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");

  try {
    const result = await analyzeAudio({ audioUrl });

    // Live response shape (when /api/v1/analyze ships): a JSON object with
    //   { key, tempo, energy, mood, instruments, ... }. Pass through verbatim.
    const analysis =
      result && typeof result === "object" ? (result as Record<string, unknown>) : { value: result };

    return JSON.stringify({
      type: "json",
      service: OFFERING,
      analysis,
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
