// =============================================================================
// suede_voice_cover — re-sing a source track with a configurable AI voice.
//
// Schema requires `audio_url` plus either `voice_id` or `reference_voice_url`.
// Backend /v1/vox not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { voiceCover } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalBoolean,
  optionalString,
  requireOneOfString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_voice_cover";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  // At least one voice identifier must be present.
  requireOneOfString(req, ["voice_id", "reference_voice_url"]);
  const voiceId = optionalString(req, "voice_id");
  const referenceVoiceUrl = optionalString(req, "reference_voice_url");
  const rightsAttestation = optionalBoolean(req, "rights_attestation");

  try {
    const result = await voiceCover({
      audioUrl,
      ...(voiceId ? { voiceId } : {}),
      ...(referenceVoiceUrl ? { referenceVoiceUrl } : {}),
      ...(rightsAttestation !== undefined ? { rightsAttestation } : {}),
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
