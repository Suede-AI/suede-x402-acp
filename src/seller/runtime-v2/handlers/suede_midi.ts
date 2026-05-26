// =============================================================================
// suede_midi — transcribe an audio source to a MIDI file.
//
// Backend /v1/midi not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { transcribeMidi } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  coerceUrlFromUnknown,
  mapBackendError,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_midi";

type MidiInstrument =
  | "auto"
  | "piano"
  | "guitar"
  | "bass"
  | "drums"
  | "vocals"
  | "strings"
  | "synth";

type MidiQuantize = "none" | "1/4" | "1/8" | "1/16" | "1/32";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const audioUrl = requireString(req, "audio_url");
  const instrument = optionalString(req, "instrument");
  const quantize = optionalString(req, "quantize");

  try {
    const result = await transcribeMidi({
      audioUrl,
      ...(instrument ? { instrument: instrument as MidiInstrument } : {}),
      ...(quantize ? { quantize: quantize as MidiQuantize } : {}),
    });

    return JSON.stringify({
      type: "midi_url",
      service: OFFERING,
      url: coerceUrlFromUnknown(result),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
