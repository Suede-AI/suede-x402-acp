// =============================================================================
// suede_rights_lookup — resolve Suede Registry attestation for a content hash.
//
// Schema requires `asset_hash` (64-char hex, optional 0x prefix). The task
// brief mentions `assetHash` or `audioUrl` — the upstream client only takes
// `assetHash`, so that's what we forward. `audio_url` would require an
// upstream feature that doesn't exist.
//
// LIVE-ish: backend /v1/rights/{hash} exists as a public x402 route. There
// is no internal-API counterpart yet, so the client throws
// SuedeInternalRouteMissingError (mapped to BACKEND_UNAVAILABLE).
// =============================================================================

import { register } from "../dispatch.js";
import { lookupRights } from "../clients/music-client-v2.js";
import {
  MUSIC_SCHEMA_VERSION,
  mapBackendError,
  optionalBoolean,
  requireString,
} from "./_lib.js";

const OFFERING = "suede_rights_lookup";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const assetHash = requireString(req, "asset_hash");
  const includeLicense = optionalBoolean(req, "include_license");

  try {
    const result = await lookupRights({
      assetHash,
      ...(includeLicense !== undefined ? { includeLicense } : {}),
    });

    const rights =
      result && typeof result === "object" ? (result as Record<string, unknown>) : { value: result };

    return JSON.stringify({
      type: "json",
      service: OFFERING,
      rights,
      schemaVersion: MUSIC_SCHEMA_VERSION,
    });
  } catch (err) {
    mapBackendError(err);
  }
}

register(OFFERING, handle);
