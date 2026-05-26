// =============================================================================
// suede_lyrics — original song lyrics from a topic/style brief.
//
// Backend route /v1/lyrics is not yet deployed: this handler will currently
// throw BACKEND_UNAVAILABLE so the runtime can submit a clean failure
// envelope rather than silently absorbing payment.
// =============================================================================

import { register } from "../dispatch.js";
import { generateLyrics } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  mapBackendError,
  optionalBoolean,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_lyrics";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const prompt = requireString(req, "prompt");
  const language = optionalString(req, "language");
  const structure = optionalString(req, "structure");
  const rhymeScheme = optionalString(req, "rhyme_scheme");
  const explicitAllowed = optionalBoolean(req, "explicit_allowed");

  try {
    const result = await generateLyrics({
      prompt,
      ...(language ? { language } : {}),
      ...(structure ? { structure } : {}),
      ...(rhymeScheme
        ? { rhyme_scheme: rhymeScheme as "auto" | "abab" | "aabb" | "abba" | "free" }
        : {}),
      ...(explicitAllowed !== undefined ? { explicit_allowed: explicitAllowed } : {}),
    });

    // Live response shape (when /v1/lyrics ships): expected to return
    //   { lyrics: string, ... } or a plain text body. Until then, this code
    //   path never executes — generateLyrics throws SuedeEndpointUnavailableError.
    const content =
      typeof result === "string"
        ? result
        : ((result as { lyrics?: unknown; content?: unknown; text?: unknown })?.lyrics ??
            (result as { content?: unknown })?.content ??
            (result as { text?: unknown })?.text);

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Suede lyrics endpoint returned no content");
    }

    return JSON.stringify({
      type: "text",
      service: OFFERING,
      content: content.trim(),
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
