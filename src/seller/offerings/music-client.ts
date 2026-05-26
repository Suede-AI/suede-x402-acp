/// <reference lib="dom" />
/**
 * Shared client for the Suede AI music + audio surface used by the
 * Producer by Suede Labs agent.
 *
 * Each exported function targets a single offering. Functions for
 * endpoints that are not yet deployed on the Suede backend throw a
 * clear, identifiable error so the seller runtime can fail the job
 * loudly instead of pretending success.
 *
 * Endpoint coverage as of 2026-05-25 (verified against
 * https://app.suedeai.ai/openapi.json and probed at runtime):
 *
 *  Live (paid x402):
 *    - POST /agent/generate       music generation     (0.20 USDC)
 *    - POST /create-music         music generation alt (0.20 USDC)
 *    - POST /agent/video          video generation     (1.50 USDC)
 *    - GET  /v1/rights/{hash}     rights lookup        (0.005 USDC)
 *    - POST /v1/analyze           audio analyze        (0.003 USDC)
 *
 *  Internal-key path (no x402 signature):
 *    - POST /api/agent/generate   music generation     (Bearer SUEDE_API_KEY)
 *
 *  Not yet deployed (return 404 from backend):
 *    - /v1/lyrics, /v1/extend, /v1/cover, /v1/vox, /v1/midi,
 *      /v1/style-coach, /v1/mastering, /v1/stems, /v1/stems-pro,
 *      /v1/acapella, /v1/lyric-sync, /v1/continue
 *
 *  Live but no internal-key path exposed (would require an x402
 *  client wallet integration to fulfill from the agent — out of
 *  scope for this scaffold):
 *    - /agent/video, /v1/rights/{hash}, /v1/analyze
 */
import "dotenv/config";

const SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "";
const SUEDE_API_BASE = (process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai").replace(/\/+$/, "");

/** Hard ceiling for client-side polling on async jobs. */
const POLL_MAX_ATTEMPTS = 240;
const POLL_INTERVAL_MS = 5_000;

function requireApiKey(): string {
  if (!SUEDE_API_KEY) {
    throw new Error(
      "SUEDE_API_KEY is not set. The Suede music client cannot reach the Suede backend without it.",
    );
  }
  return SUEDE_API_KEY;
}

function jsonHeaders(idempotencyKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
  return h;
}

/** Error thrown when the seller hits a Suede endpoint that isn't deployed yet. */
export class SuedeEndpointUnavailableError extends Error {
  constructor(endpoint: string) {
    super(
      `Suede backend endpoint ${endpoint} not yet deployed. ` +
        `Handler is scaffolded but unfulfillable until backend ships.`,
    );
    this.name = "SuedeEndpointUnavailableError";
  }
}

/** Error thrown when a live x402 endpoint has no internal-API counterpart. */
export class SuedeInternalRouteMissingError extends Error {
  constructor(publicEndpoint: string) {
    super(
      `Suede ${publicEndpoint} is live as a public x402 endpoint but has no ` +
        `internal-API counterpart exposed for SUEDE_API_KEY callers. The seller agent ` +
        `cannot fulfill this offering until either an internal /api/* counterpart is ` +
        `added or this client is upgraded to pay x402 from a funded wallet.`,
    );
    this.name = "SuedeInternalRouteMissingError";
  }
}

interface SuedeMusicGenerateResult {
  trackId?: string;
  shareUrl?: string;
  assetUrl?: string;
  title?: string;
  imageUrl?: string;
  provenance?: { fingerprint?: string };
}

interface SuedeVideoGenerateResult {
  videoId?: string;
  shareUrl?: string;
  assetUrl?: string;
  videoUrl?: string;
  status?: string;
  jobId?: string;
}

// ---------------------------------------------------------------------------
// Music generation (LIVE via internal API key)
// ---------------------------------------------------------------------------

export interface GenerateMusicOptions {
  prompt: string;
  durationSeconds?: number;
  style?: string;
  custom_mode?: boolean;
  lyrics?: string;
  make_instrumental?: boolean;
  vocal_gender?: "m" | "f";
  tags?: string;
  idempotencyKey?: string;
}

/**
 * Generate an original music track via the Suede internal music endpoint.
 * Uses the SUEDE_API_KEY-authenticated route, NOT the x402 path.
 */
export async function generateMusic(
  opts: GenerateMusicOptions,
): Promise<SuedeMusicGenerateResult> {
  const url = `${SUEDE_API_BASE}/api/agent/generate`;
  const body = {
    prompt: opts.prompt,
    ...(opts.durationSeconds !== undefined ? { durationSeconds: opts.durationSeconds } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.custom_mode !== undefined ? { custom_mode: opts.custom_mode } : {}),
    ...(opts.lyrics ? { lyrics: opts.lyrics } : {}),
    ...(opts.make_instrumental !== undefined ? { make_instrumental: opts.make_instrumental } : {}),
    ...(opts.vocal_gender ? { vocal_gender: opts.vocal_gender } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(opts.idempotencyKey),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Suede music generation failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as SuedeMusicGenerateResult;
  if (!data.shareUrl && !data.assetUrl && !data.trackId) {
    throw new Error(`Suede music generation returned no track: ${JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Video generation (LIVE on x402, no internal route exposed)
// ---------------------------------------------------------------------------

export interface GenerateVideoOptions {
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1024p";
  seed?: number;
}

/**
 * Generate a video clip via the Suede video endpoint.
 *
 * As of 2026-05-25 only the x402 public route `POST /agent/video` is live;
 * there is no `/api/*` counterpart for the SUEDE_API_KEY-authenticated path.
 * Throws SuedeInternalRouteMissingError until either:
 *   (a) the Suede backend exposes an internal counterpart, or
 *   (b) this client is upgraded to pay x402 from a funded wallet.
 */
export async function generateVideo(
  _opts: GenerateVideoOptions,
): Promise<SuedeVideoGenerateResult> {
  throw new SuedeInternalRouteMissingError("POST /agent/video");
}

// ---------------------------------------------------------------------------
// Rights lookup (LIVE on x402, no internal route exposed)
// ---------------------------------------------------------------------------

export interface LookupRightsOptions {
  assetHash: string;
  includeLicense?: boolean;
}

/**
 * Resolve Suede Registry attestation for a content hash on Base.
 * Live at `GET /v1/rights/{assetHash}` (x402), no internal counterpart.
 */
export async function lookupRights(_opts: LookupRightsOptions): Promise<unknown> {
  throw new SuedeInternalRouteMissingError("GET /v1/rights/{assetHash}");
}

// ---------------------------------------------------------------------------
// Audio analyze (LIVE on x402, no internal route exposed)
// ---------------------------------------------------------------------------

export interface AnalyzeAudioOptions {
  audioUrl: string;
}

/**
 * Analyze an audio URL and return BPM, key, mode, energy, etc.
 * Live at `POST /v1/analyze` (x402), no internal counterpart.
 */
export async function analyzeAudio(_opts: AnalyzeAudioOptions): Promise<unknown> {
  throw new SuedeInternalRouteMissingError("POST /v1/analyze");
}

// ---------------------------------------------------------------------------
// Not-yet-deployed Suede endpoints — handler scaffolds throw clearly so the
// seller runtime can mark jobs failed instead of pretending success.
// ---------------------------------------------------------------------------

export interface GenerateLyricsOptions {
  prompt: string;
  language?: string;
  structure?: string;
  rhyme_scheme?: "auto" | "abab" | "aabb" | "abba" | "free";
  explicit_allowed?: boolean;
}

export async function generateLyrics(_opts: GenerateLyricsOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/lyrics");
}

export interface ExtendTrackOptions {
  trackId?: string;
  audioUrl?: string;
  durationSeconds: number;
  prompt?: string;
}

export async function extendTrack(_opts: ExtendTrackOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/extend");
}

export interface CoverTrackOptions {
  trackId?: string;
  audioUrl?: string;
  stylePrompt: string;
  preserveVocals?: boolean;
}

export async function coverTrack(_opts: CoverTrackOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/cover");
}

export interface VoiceCoverOptions {
  audioUrl: string;
  voiceId?: string;
  referenceVoiceUrl?: string;
  rightsAttestation?: boolean;
}

export async function voiceCover(_opts: VoiceCoverOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/vox");
}

export interface ContinueTrackOptions {
  audioUrl: string;
  prompt?: string;
  durationSeconds?: number;
  sectionHint?: "verse" | "chorus" | "bridge" | "breakdown" | "drop" | "outro" | "auto";
}

export async function continueTrack(_opts: ContinueTrackOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/continue");
}

export interface ExtractStemsOptions {
  audioUrl: string;
  stems?: Array<"vocals" | "drums" | "bass" | "melody" | "other">;
  mode?: "vocal_inst" | "drum_other";
  outputFormat?: "wav" | "mp3" | "flac";
  sampleRate?: 44100 | 48000;
  tier?: "basic" | "pro";
}

export async function extractStems(opts: ExtractStemsOptions): Promise<unknown> {
  const endpoint = opts.tier === "pro" ? "POST /v1/stems-pro" : "POST /v1/stems";
  throw new SuedeEndpointUnavailableError(endpoint);
}

export interface ExtractAcapellaOptions {
  audioUrl: string;
  outputFormat?: "wav" | "mp3" | "flac";
  denoise?: boolean;
}

export async function extractAcapella(_opts: ExtractAcapellaOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/acapella");
}

export interface TranscribeMidiOptions {
  audioUrl: string;
  instrument?: "auto" | "piano" | "guitar" | "bass" | "drums" | "vocals" | "strings" | "synth";
  quantize?: "none" | "1/4" | "1/8" | "1/16" | "1/32";
}

export async function transcribeMidi(_opts: TranscribeMidiOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/midi");
}

export interface MasterWavOptions {
  audioUrl: string;
  targetLoudnessLufs?: number;
  outputFormat?: "wav" | "flac" | "mp3";
  preset?: "neutral" | "warm" | "bright" | "punchy" | "vintage";
}

export async function masterWav(_opts: MasterWavOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/mastering");
}

export interface SyncLyricsOptions {
  audioUrl: string;
  lyrics: string;
  language?: string;
  format?: "lrc" | "enhanced_lrc" | "json" | "vtt";
}

export async function syncLyrics(_opts: SyncLyricsOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/lyric-sync");
}

export interface CoachStyleOptions {
  prompt: string;
  targetUse?: "music_generation" | "cover" | "continuation" | "catalog_tagging" | "search";
  maxTokens?: number;
}

export async function coachStyle(_opts: CoachStyleOptions): Promise<unknown> {
  throw new SuedeEndpointUnavailableError("POST /v1/style-coach");
}

// Helpers for sleeping in polled async jobs (used once internal endpoints land).
export function _sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const _internals = {
  POLL_MAX_ATTEMPTS,
  POLL_INTERVAL_MS,
  SUEDE_API_BASE,
};
