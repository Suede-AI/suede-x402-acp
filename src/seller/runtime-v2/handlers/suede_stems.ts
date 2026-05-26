// =============================================================================
// suede_stems — separate a source track into vocals / drums / bass / other.
//
// Schema delivers a ZIP URL containing each stem file. Backend /v1/stems not
// yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { extractStems } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_stems";

type StemsFormat = "wav" | "mp3" | "flac";
type StemsMode = "vocal_inst" | "drum_other";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const mode = optionalString(req, "mode");
  const outputFormat = optionalString(req, "output_format");

  try {
    const result = await extractStems({
      audioUrl,
      tier: "basic",
      ...(mode ? { mode: mode as StemsMode } : {}),
      ...(outputFormat ? { outputFormat: outputFormat as StemsFormat } : {}),
    });

    return JSON.stringify({
      type: "zip_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      stems: ["vocals", "drums", "bass", "other"],
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
