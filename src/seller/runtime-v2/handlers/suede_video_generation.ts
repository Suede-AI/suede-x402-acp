// =============================================================================
// suede_video_generation — looser schema, broader creative latitude.
// Optional duration_seconds (4-30, default 10), resolution ("720p"|"1024p"),
// aspect_ratio, seed. Cheap tier ($3.75) for exploratory generation.
// =============================================================================
import { register } from "../dispatch.js";
import { generateVideo, type GenerateVideoOpts } from "../clients/video-client.js";

const SCHEMA_VERSION = "v2-video-1";
const SERVICE_NAME = "suede_video_generation";

const DURATION_MIN = 4;
const DURATION_MAX = 30;
const DURATION_DEFAULT = 10;

function requireString(req: Record<string, unknown>, field: string): string {
  const v = req[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing or invalid required field: ${field}`);
  }
  return v.trim();
}

function optionalEnum<T extends string>(
  req: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new Error(
      `Field ${field} must be one of: ${allowed.join(", ")}`
    );
  }
  return v as T;
}

function optionalIntegerInRange(
  req: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error(`Field ${field} must be an integer`);
  }
  if (v < min || v > max) {
    throw new Error(`Field ${field} must be between ${min} and ${max}`);
  }
  return v;
}

function optionalInteger(
  req: Record<string, unknown>,
  field: string
): number | undefined {
  const v = req[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error(`Field ${field} must be an integer`);
  }
  return v;
}

register(SERVICE_NAME, async (req) => {
  const prompt = requireString(req, "prompt");

  // The published offering schema uses camelCase (`durationSeconds`,
  // `aspectRatio`) but real callers will mix snake_case. Accept either.
  const duration =
    optionalIntegerInRange(req, "durationSeconds", DURATION_MIN, DURATION_MAX) ??
    optionalIntegerInRange(req, "duration_seconds", DURATION_MIN, DURATION_MAX) ??
    DURATION_DEFAULT;

  const aspectRatio =
    optionalEnum(req, "aspectRatio", ["16:9", "9:16", "1:1"] as const) ??
    optionalEnum(req, "aspect_ratio", ["16:9", "9:16", "1:1"] as const) ??
    "16:9";

  const resolution =
    optionalEnum(req, "resolution", ["720p", "1024p"] as const) ?? "720p";

  const seed = optionalInteger(req, "seed");

  const opts: GenerateVideoOpts = {
    prompt,
    aspect_ratio: aspectRatio,
    duration_seconds: duration,
    resolution,
  };
  if (seed !== undefined) opts.seed = seed;

  const result = await generateVideo(opts);
  return JSON.stringify({
    type: "video_url",
    service: SERVICE_NAME,
    url: result.url,
    share_url: result.share_url,
    schemaVersion: SCHEMA_VERSION,
  });
});

// Exported for tests.
export const _testHelpers = {
  requireString,
  optionalEnum,
  optionalIntegerInRange,
  optionalInteger,
  SERVICE_NAME,
  SCHEMA_VERSION,
  DURATION_MIN,
  DURATION_MAX,
  DURATION_DEFAULT,
};
