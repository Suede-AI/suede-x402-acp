// =============================================================================
// suede_continue — generate a variation or sequel continuing an existing
// track in the same musical direction.
//
// Backend /v1/continue not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { continueTrack } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalIntegerInRange,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_continue";

type ContinueSectionHint =
  | "verse"
  | "chorus"
  | "bridge"
  | "breakdown"
  | "drop"
  | "outro"
  | "auto";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const prompt = optionalString(req, "prompt");
  const durationSeconds = optionalIntegerInRange(req, "duration_seconds", 10, 240);
  const sectionHint = optionalString(req, "section_hint");

  try {
    const result = await continueTrack({
      audioUrl,
      ...(prompt ? { prompt } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(sectionHint ? { sectionHint: sectionHint as ContinueSectionHint } : {}),
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
