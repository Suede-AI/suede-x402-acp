// =============================================================================
// suede_master_wav — master an input mix to a polished WAV.
//
// Backend /v1/mastering not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { masterWav } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalString,
  requireString,
  HandlerError,
  ERROR_CODES,
} from "./_lib.js";

const OFFERING = "suede_master_wav";

type MasterFormat = "wav" | "flac" | "mp3";
type MasterPreset = "neutral" | "warm" | "bright" | "punchy" | "vintage";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const outputFormat = optionalString(req, "output_format");
  const preset = optionalString(req, "preset");

  // target_loudness_lufs is a number, not necessarily an integer. Validate
  // inline since the helper only handles integers.
  const lufsRaw = req["target_loudness_lufs"];
  let targetLoudnessLufs: number | undefined;
  if (lufsRaw !== undefined && lufsRaw !== null) {
    if (typeof lufsRaw !== "number" || !Number.isFinite(lufsRaw)) {
      throw new HandlerError(
        ERROR_CODES.INVALID_INPUT,
        "target_loudness_lufs must be a number"
      );
    }
    if (lufsRaw < -23 || lufsRaw > -6) {
      throw new HandlerError(
        ERROR_CODES.INVALID_INPUT,
        "target_loudness_lufs must be between -23 and -6"
      );
    }
    targetLoudnessLufs = lufsRaw;
  }

  try {
    const result = await masterWav({
      audioUrl,
      ...(targetLoudnessLufs !== undefined ? { targetLoudnessLufs } : {}),
      ...(outputFormat ? { outputFormat: outputFormat as MasterFormat } : {}),
      ...(preset ? { preset: preset as MasterPreset } : {}),
    });

    return JSON.stringify({
      type: "wav_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
