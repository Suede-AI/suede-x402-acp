// =============================================================================
// suede_style_coach — expand a rough style/vibe prompt into a production-
// ready style brief optimized for downstream use (music_generation, cover,
// continuation, catalog_tagging, search).
//
// NOTE: despite the task brief stating `audioUrl` is required, the schema in
// scripts/v2-import-payload.json requires `prompt`, and the music client
// signature `coachStyle({ prompt, targetUse?, maxTokens? })` matches that
// shape. We follow the schema + client (single source of truth).
//
// Backend /v1/style-coach not yet deployed — handler throws BACKEND_UNAVAILABLE.
// =============================================================================

import { register } from "../dispatch.js";
import { coachStyle } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  mapBackendError,
  optionalIntegerInRange,
  optionalString,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_style_coach";

type StyleCoachTargetUse =
  | "music_generation"
  | "cover"
  | "continuation"
  | "catalog_tagging"
  | "search";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const prompt = requireString(req, "prompt");
  const targetUse = optionalString(req, "target_use");
  const maxTokens = optionalIntegerInRange(req, "max_tokens", 16, 200);

  try {
    const result = await coachStyle({
      prompt,
      ...(targetUse ? { targetUse: targetUse as StyleCoachTargetUse } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    });

    // Live response shape (when /v1/style-coach ships): expected to return
    //   { content: string } or a plain string. Until then this code path
    //   never executes — coachStyle throws SuedeEndpointUnavailableError.
    const content =
      typeof result === "string"
        ? result
        : ((result as { content?: unknown; text?: unknown })?.content ??
            (result as { text?: unknown })?.text);

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Suede style-coach endpoint returned no content");
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
