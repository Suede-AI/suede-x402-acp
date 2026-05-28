// =============================================================================
// Shared input validators for the v2 VIDEO handlers
// (general_video, meme_video, product_showcase_video[_10s]).
//
// Kept separate from _lib.ts (the music handlers) ON PURPOSE: the video handlers
// throw plain Error with field-shaped messages and use a STRICT
// optionalStringArray (rejects non-arrays), whereas _lib.ts throws structured
// HandlerError and silently tolerates malformed arrays. These were copy-pasted
// verbatim across the four video handlers; centralizing here removes the
// duplication without changing any handler's behavior.
// =============================================================================

export function requireString(
  req: Record<string, unknown>,
  field: string
): string {
  const v = req[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  return v.trim();
}

export function optionalString(
  req: Record<string, unknown>,
  field: string
): string | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    throw new Error(`Field ${field} must be a string`);
  }
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalStringArray(
  req: Record<string, unknown>,
  field: string
): string[] | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new Error(`Field ${field} must be an array of strings`);
  }
  const cleaned = v.filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  return cleaned.length > 0 ? cleaned : undefined;
}

export function optionalEnum<T extends string>(
  req: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new Error(`Field ${field} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

export function optionalBoolean(
  req: Record<string, unknown>,
  field: string
): boolean | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new Error(`Field ${field} must be a boolean`);
  }
  return v;
}

export function requireImageRef(
  req: Record<string, unknown>
): { image_url?: string; image_urls?: string[] } {
  const single = optionalString(req, "image_url");
  const multi = optionalStringArray(req, "image_urls");
  if (!single && (!multi || multi.length === 0)) {
    throw new Error(
      "At least one of image_url or image_urls is required for product_showcase variants"
    );
  }
  return { image_url: single, image_urls: multi };
}
