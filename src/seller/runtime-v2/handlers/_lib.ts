// =============================================================================
// Shared helpers for v2 music + audio handlers.
//
// Kept intentionally small: a string-field validator, a string-of-strings
// (one-of) validator for offerings where either field can satisfy the
// requirement (e.g. cover/extend accept track_id OR audio_url), and an
// optional-positive-integer validator for numeric fields like
// duration_seconds.
//
// Handlers use these to fail closed on bad input before paying the upstream
// Suede backend.
// =============================================================================

import {
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
} from "../clients/music-client-v2.js";

/** Errors with a structured `code` so the runtime envelope can route them. */
export class HandlerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HandlerError";
    this.code = code;
  }
}

/** Schema version stamped on music deliverables. */
export const MUSIC_SCHEMA_VERSION = "v2-music-1";

/** Codes the runtime maps to a failure envelope. */
export const ERROR_CODES = {
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  INVALID_INPUT: "INVALID_INPUT",
} as const;

/**
 * Validate that `req[field]` is a non-empty string. Returns the trimmed value.
 * Throws HandlerError("INVALID_INPUT") otherwise.
 */
export function requireString(
  req: Record<string, unknown>,
  field: string
): string {
  const v = req[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      `Missing or invalid required field: ${field}`
    );
  }
  return v.trim();
}

/**
 * Validate that at least one of `fields` has a non-empty string value. Returns
 * the first matching value found, or throws HandlerError("INVALID_INPUT").
 */
export function requireOneOfString(
  req: Record<string, unknown>,
  fields: string[]
): string {
  for (const f of fields) {
    const v = req[f];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  throw new HandlerError(
    ERROR_CODES.INVALID_INPUT,
    `Missing required field — provide at least one of: ${fields.join(", ")}`
  );
}

/** Optional non-empty string passthrough. */
export function optionalString(
  req: Record<string, unknown>,
  field: string
): string | undefined {
  const v = req[field];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Optional string-array passthrough. Filters non-string entries and trims each
 * string. Returns undefined when the field is missing, not an array, or
 * contains no non-empty strings.
 */
export function optionalStringArray(
  req: Record<string, unknown>,
  field: string
): string[] | undefined {
  const v = req[field];
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Validate that `req[field]` is a positive integer within bounds, when
 * present. Returns the value, or undefined when the field is missing.
 */
export function optionalIntegerInRange(
  req: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      `Field ${field} must be an integer`
    );
  }
  if (v < min || v > max) {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      `Field ${field} must be between ${min} and ${max}`
    );
  }
  return v;
}

/**
 * Heuristic check: does this string look like something `resolveAcpProfile`
 * can handle (URL, UUID, or EVM wallet)? Used by handlers in Category 1/2
 * that accept EITHER an ACP identifier or free-text — if the input is plainly
 * text, we skip the network round-trip.
 *
 * Mirrors the loose-shape acceptors in acp-resolver.ts:
 *   - http(s)://...virtuals.io/...      → URL shape
 *   - http(s)://... (any host)         → URL shape (resolver will reject if
 *                                         not a Virtuals URL, but it's still
 *                                         worth a resolver call so the
 *                                         deliverable surfaces the failure)
 *   - 0x + 40 hex chars                 → EVM wallet
 *   - 8-4-4-4-12 hex                   → UUID
 *
 * Anything else (e.g. "I sell music covers", "audit my agent please") is
 * treated as free-text and the handler should skip resolution.
 */
export function looksLikeAcpIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/** Optional boolean passthrough. Throws if present but wrong type. */
export function optionalBoolean(
  req: Record<string, unknown>,
  field: string
): boolean | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new HandlerError(
      ERROR_CODES.INVALID_INPUT,
      `Field ${field} must be a boolean`
    );
  }
  return v;
}

/**
 * Translate a Suede backend gap into a clean HandlerError so the v2 runtime's
 * UPSTREAM_FAILURE envelope reports a known code rather than a raw stack.
 *
 * Re-throws unrelated errors verbatim.
 */
export function mapBackendError(err: unknown): never {
  if (
    err instanceof SuedeEndpointUnavailableError ||
    err instanceof SuedeInternalRouteMissingError
  ) {
    throw new HandlerError(ERROR_CODES.BACKEND_UNAVAILABLE, err.message);
  }
  if (err instanceof HandlerError) throw err;
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}

/**
 * Best-effort resolver for the public-facing URL of a generated music asset.
 * The Suede client returns `shareUrl`, `assetUrl`, or just a `trackId` — the
 * envelope needs a usable URL string, so prefer share -> asset and synthesize
 * a placeholder using the trackId when neither shipped (still surfaces the
 * id to the buyer).
 */
export function resolveMusicUrl(result: {
  shareUrl?: string;
  assetUrl?: string;
  trackId?: string;
}): string {
  if (result.shareUrl && result.shareUrl.trim()) return result.shareUrl.trim();
  if (result.assetUrl && result.assetUrl.trim()) return result.assetUrl.trim();
  if (result.trackId && result.trackId.trim()) {
    return `suede:track:${result.trackId.trim()}`;
  }
  throw new HandlerError(
    ERROR_CODES.BACKEND_UNAVAILABLE,
    "Suede music response did not include a usable URL or track id"
  );
}

/**
 * Coerce an unknown upstream response (the not-yet-deployed routes throw
 * before this is reached, but live routes return `unknown`) to a URL string.
 * Returns the input when it's already a string, the first plausible URL field
 * when it's an object, or throws.
 */
export function coerceUrlFromUnknown(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["url", "assetUrl", "shareUrl", "downloadUrl", "fileUrl"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
  }
  throw new HandlerError(
    ERROR_CODES.BACKEND_UNAVAILABLE,
    "Suede response did not include a URL field"
  );
}
