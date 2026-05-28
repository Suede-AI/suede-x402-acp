/// <reference lib="dom" />
/**
 * v2 Suede video generation client.
 *
 * Hits the Suede AI internal video endpoint (`POST /agent/video?async=true`)
 * with `Authorization: Bearer ${SUEDE_API_KEY}`, then polls the returned
 * status URL until the job finishes or times out.
 *
 * IMPORTANT — async-only by design:
 *   The synchronous variant (`/agent/video` without `?async=true`) has a
 *   ~30s hard timeout on the Suede backend that routinely trips for any
 *   non-trivial generation. Per global memory, ALWAYS use the async path
 *   and poll. See vault note `agentcash + Suede AI async` (2026-05-26).
 *
 * Pollster contract:
 *   - Poll every 5_000 ms
 *   - Max 300 attempts (≈ 25 minutes)
 *   - Surface terminal states: status === "done" | "failed"
 *
 * The upstream backend's response shape is intentionally tolerated in
 * multiple variants (`videoUrl` | `assetUrl` | `url` | `result.url`) so
 * that minor backend renames don't break the seller runtime mid-job.
 */
import "dotenv/config";

const SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "";
const SUEDE_API_BASE = (
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai"
).replace(/\/+$/, "");

/**
 * Origin of SUEDE_API_BASE — computed once at module load and used to gate
 * Bearer-bearing poll requests. A malformed base URL is treated as a fatal
 * config error: we'd rather crash on boot than send the Suede Bearer to an
 * attacker-controlled host.
 */
const SUEDE_API_ORIGIN: string = (() => {
  try {
    return new URL(SUEDE_API_BASE).origin;
  } catch {
    throw new Error(
      `[video-client] SUEDE_API_BASE_URL is not a valid URL: ${SUEDE_API_BASE}`
    );
  }
})();

/**
 * Assert that `pollUrl` is anchored to SUEDE_API_ORIGIN before we send the
 * Suede Bearer to it. Defends against backend bug / tampering that injects a
 * foreign host into statusUrl.
 *
 * Relative paths (e.g. "/agent/video/abc") are anchored to SUEDE_API_BASE
 * before reaching this check — see the call site in generateVideo. By the
 * time we get here pollUrl is always absolute.
 */
function assertSuedeOrigin(pollUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(pollUrl);
  } catch {
    throw new Error(
      `[video-client] refusing to poll: malformed URL "${pollUrl}"`
    );
  }
  if (parsed.origin !== SUEDE_API_ORIGIN) {
    throw new Error(
      `[video-client] refusing to send Bearer to foreign origin ${parsed.origin} (expected ${SUEDE_API_ORIGIN})`
    );
  }
}

/**
 * Hard ceiling on polling so a stuck job can't pin the worker forever.
 *
 * Exposed via a mutable `pollConfig` object so unit tests can shrink the loop
 * without restarting the module. Production code never mutates it.
 */
const pollConfig = {
  intervalMs: 5_000,
  maxAttempts: 300, // 5s * 300 = 25 minutes
};

/** Hard per-request timeout. A single create/poll response should arrive well
 * under this; it bounds a hung socket so the inflight job key is always released. */
const REQUEST_TIMEOUT_MS = 30_000;

/** fetch() with an AbortController deadline; the timer is always cleared. */
async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface GenerateVideoOpts {
  prompt: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  mode?: "pro" | "std";
  sound?: boolean;
  image_urls?: string[];
  image_url?: string;
  duration_seconds?: number;
  resolution?: "720p" | "1024p";
  seed?: number;
}

export interface GenerateVideoResult {
  url: string;
  share_url?: string;
}

function requireApiKey(): string {
  if (!SUEDE_API_KEY) {
    throw new Error(
      "SUEDE_API_KEY is not set. The Suede video client cannot reach the Suede backend without it."
    );
  }
  return SUEDE_API_KEY;
}

/**
 * Throws if SUEDE_API_KEY is missing. Called by the seller runtime at
 * startup to refuse to register video offerings before they can accept
 * payment they can't fulfil.
 */
export function assertReady(): void {
  requireApiKey();
}

function jsonHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build the Suede backend payload from caller opts.
 *
 * Notes on field mapping:
 *  - `image_url` (single) is merged into `image_urls` so the backend only
 *    has to know one path. Mirrors the kie.ai-compatible payload shape used
 *    by v1.
 *  - Undefined fields are dropped so we don't override backend defaults
 *    with `undefined`.
 */
function buildPayload(opts: GenerateVideoOpts): Record<string, unknown> {
  const imageUrls: string[] = [];
  if (opts.image_url) imageUrls.push(opts.image_url);
  if (opts.image_urls && opts.image_urls.length > 0) {
    for (const u of opts.image_urls) {
      if (typeof u === "string" && u.trim()) imageUrls.push(u);
    }
  }

  const payload: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio: opts.aspect_ratio ?? "16:9",
    mode: opts.mode ?? "pro",
    sound: opts.sound ?? true,
  };
  if (imageUrls.length > 0) payload.image_urls = imageUrls;
  if (opts.duration_seconds !== undefined)
    payload.duration_seconds = opts.duration_seconds;
  if (opts.resolution !== undefined) payload.resolution = opts.resolution;
  if (opts.seed !== undefined) payload.seed = opts.seed;
  return payload;
}

interface CreateResponse extends Record<string, unknown> {
  jobId?: string;
  job_id?: string;
  id?: string;
  status?: string;
  statusUrl?: string;
  status_url?: string;
  // Some backends return the asset URL immediately if the job is already done.
  videoUrl?: string;
  video_url?: string;
  assetUrl?: string;
  asset_url?: string;
  url?: string;
  shareUrl?: string;
  share_url?: string;
}

function extractAssetUrl(data: Record<string, unknown>): string | undefined {
  const candidates: Array<unknown> = [
    data.videoUrl,
    data.video_url,
    data.assetUrl,
    data.asset_url,
    data.url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  // Nested .result.url shape
  const result = data.result as Record<string, unknown> | undefined;
  if (result && typeof result === "object") {
    for (const k of ["url", "videoUrl", "video_url", "assetUrl", "asset_url"]) {
      const v = result[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

function extractShareUrl(data: Record<string, unknown>): string | undefined {
  const candidates: Array<unknown> = [data.shareUrl, data.share_url];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function extractStatus(data: Record<string, unknown>): string {
  const s = data.status;
  return typeof s === "string" ? s.toLowerCase() : "";
}

function extractStatusUrl(data: Record<string, unknown>): string | undefined {
  const c = (data.statusUrl ?? data.status_url) as unknown;
  return typeof c === "string" && c.trim() ? c.trim() : undefined;
}

function extractJobId(data: Record<string, unknown>): string | undefined {
  const candidates: Array<unknown> = [data.jobId, data.job_id, data.id];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Generate a video via the Suede backend.
 *
 * Always uses `?async=true`. If the backend returns a terminal "done" state
 * on create (e.g. cached), we return immediately. Otherwise we poll the
 * returned status URL every 5s until done / failed / timeout.
 */
export async function generateVideo(
  opts: GenerateVideoOpts
): Promise<GenerateVideoResult> {
  if (!opts.prompt || typeof opts.prompt !== "string" || !opts.prompt.trim()) {
    throw new Error("generateVideo requires a non-empty prompt");
  }

  const createUrl = `${SUEDE_API_BASE}/agent/video?async=true`;
  const headers = jsonHeaders();
  const payload = buildPayload(opts);

  const createResp = await fetchWithTimeout(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!createResp.ok) {
    // SECURITY: Some upstream APIs echo Bearer tokens in error bodies. The
    // thrown error message is later surfaced to the buyer via session.submit(),
    // so we MUST NOT include the body in the thrown message. Log it
    // server-side only.
    const text = await createResp.text();
    console.error(
      "[video-client] upstream create error",
      createResp.status,
      text.slice(0, 200)
    );
    throw new Error(`Suede video create failed: HTTP ${createResp.status}`);
  }

  const createData = (await createResp.json()) as CreateResponse;
  const createDataRecord: Record<string, unknown> = createData;
  const createdStatus = extractStatus(createDataRecord);
  if (createdStatus === "failed") {
    throw new Error(
      `Suede video job failed on create: ${JSON.stringify(createData)}`
    );
  }

  // Already-done shortcut.
  if (createdStatus === "done") {
    const url = extractAssetUrl(createDataRecord);
    if (!url) {
      throw new Error(
        `Suede video job reported done but no URL was returned: ${JSON.stringify(createData)}`
      );
    }
    return { url, share_url: extractShareUrl(createDataRecord) };
  }

  // Determine where to poll.
  let pollUrl = extractStatusUrl(createDataRecord);
  if (!pollUrl) {
    const jobId = extractJobId(createDataRecord);
    if (!jobId) {
      throw new Error(
        `Suede video create returned neither statusUrl nor jobId: ${JSON.stringify(createData)}`
      );
    }
    pollUrl = `${SUEDE_API_BASE}/agent/video/${encodeURIComponent(jobId)}`;
  } else if (pollUrl.startsWith("/")) {
    // Relative URL — anchor it to the configured base.
    pollUrl = `${SUEDE_API_BASE}${pollUrl}`;
  }

  // After anchoring (if relative), validate ONCE that the poll URL is on the
  // expected Suede origin before any Bearer-bearing request. We re-validate
  // before every fetch as defense-in-depth in case pollUrl is ever mutated
  // mid-loop.
  assertSuedeOrigin(pollUrl);

  for (let attempt = 0; attempt < pollConfig.maxAttempts; attempt++) {
    await sleep(pollConfig.intervalMs);

    // Defense-in-depth: re-check the origin on every iteration.
    assertSuedeOrigin(pollUrl);

    let pollResp: Response;
    try {
      pollResp = await fetchWithTimeout(pollUrl, { headers });
    } catch (err) {
      // A single slow/timed-out poll is transient — retry next tick rather than
      // failing the whole job. The maxAttempts ceiling bounds total wall time.
      console.warn(
        "[video-client] poll request failed, retrying",
        err instanceof Error ? err.message : err
      );
      continue;
    }
    if (!pollResp.ok) {
      // Transient errors are tolerated — try again next tick. Only abort on
      // 4xx that mean the job is gone or unauthorized.
      if (pollResp.status === 401 || pollResp.status === 403) {
        throw new Error(
          `Suede video poll failed (${pollResp.status}): authorization rejected`
        );
      }
      if (pollResp.status === 404) {
        throw new Error(
          `Suede video poll failed (404): job not found at ${pollUrl}`
        );
      }
      // Otherwise loop and try again.
      continue;
    }

    const pollData = (await pollResp.json()) as Record<string, unknown>;
    const status = extractStatus(pollData);

    if (status === "failed") {
      const errMsg =
        typeof pollData.error === "string"
          ? pollData.error
          : typeof pollData.message === "string"
            ? pollData.message
            : JSON.stringify(pollData);
      throw new Error(`Suede video job failed: ${errMsg}`);
    }

    if (status === "done") {
      const url = extractAssetUrl(pollData);
      if (!url) {
        throw new Error(
          `Suede video job marked done but no URL: ${JSON.stringify(pollData)}`
        );
      }
      return { url, share_url: extractShareUrl(pollData) };
    }
    // Otherwise: pending / queued / running — keep polling.
  }

  throw new Error(
    `Suede video job timed out after ${pollConfig.maxAttempts} attempts (~${(pollConfig.maxAttempts * pollConfig.intervalMs) / 60000} minutes)`
  );
}

// Exported for tests so they can shrink the poll loop instead of waiting 25 min.
export const _internals = {
  pollConfig,
  SUEDE_API_BASE,
  SUEDE_API_ORIGIN,
  assertSuedeOrigin,
  buildPayload,
  extractAssetUrl,
  extractShareUrl,
  extractStatus,
  extractStatusUrl,
  extractJobId,
};
