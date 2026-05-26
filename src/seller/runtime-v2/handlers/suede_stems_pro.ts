// =============================================================================
// suede_stems_pro — high-fidelity stem separation, pro tier.
//
// Backend /v1/stems-pro not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { extractStems } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalIntegerInRange,
  optionalString,
  requireString,
  HandlerError,
  ERROR_CODES,
} from "./_lib.js";

const OFFERING = "suede_stems_pro";

type StemsFormat = "wav" | "mp3" | "flac";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const outputFormat = optionalString(req, "output_format");
  // Sample rate is an integer enum (44100 | 48000) in the schema. We accept
  // either via the generic integer-range validator.
  const sampleRate = optionalIntegerInRange(req, "sample_rate", 44100, 48000);
  if (sampleRate !== undefined && sampleRate !== 44100 && sampleRate !== 48000) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      "sample_rate must be either 44100 or 48000"
    );
  }

  try {
    const result = await extractStems({
      audioUrl,
      tier: "pro",
      ...(outputFormat ? { outputFormat: outputFormat as StemsFormat } : {}),
      ...(sampleRate ? { sampleRate: sampleRate as 44100 | 48000 } : {}),
    });

    return JSON.stringify({
      type: "zip_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      quality: "pro",
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
