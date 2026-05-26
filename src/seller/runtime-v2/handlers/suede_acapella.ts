// =============================================================================
// suede_acapella — isolate the vocal stem from a source track.
//
// Backend /v1/acapella not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { extractAcapella } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalBoolean,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_acapella";

type AcapellaFormat = "wav" | "mp3" | "flac";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const outputFormat = optionalString(req, "output_format");
  const denoise = optionalBoolean(req, "denoise");

  try {
    const result = await extractAcapella({
      audioUrl,
      ...(outputFormat ? { outputFormat: outputFormat as AcapellaFormat } : {}),
      ...(denoise !== undefined ? { denoise } : {}),
    });

    return JSON.stringify({
      type: "audio_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      stem: "vocal",
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
