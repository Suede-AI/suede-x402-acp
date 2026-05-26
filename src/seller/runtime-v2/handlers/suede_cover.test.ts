/**
 * Tests for the suede_cover v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coverTrack = vi.fn();
class SuedeEndpointUnavailableError extends Error {
  constructor(endpoint: string) {
    super(`Suede backend endpoint ${endpoint} not yet deployed`);
    this.name = "SuedeEndpointUnavailableError";
  }
}
class SuedeInternalRouteMissingError extends Error {
  constructor(endpoint: string) {
    super(`Suede ${endpoint} is live as x402 but has no internal counterpart`);
    this.name = "SuedeInternalRouteMissingError";
  }
}

vi.mock("../clients/music-client-v2.js", () => ({
  coverTrack,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_cover.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  coverTrack.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_cover handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_cover")).toBe(handle);
  });

  it("rejects missing style_prompt", async () => {
    await expect(handle({ audio_url: "https://x/y.mp3" })).rejects.toThrow(
      /Missing or invalid required field: style_prompt/
    );
  });

  it("rejects when both track_id and audio_url are missing", async () => {
    await expect(
      handle({ style_prompt: "80s synthwave" })
    ).rejects.toThrow(/at least one of: audio_url, track_id/);
  });

  it("forwards trackId, stylePrompt, and preserveVocals", async () => {
    coverTrack.mockResolvedValueOnce({ url: "https://cdn.suedeai.xyz/cov.mp3" });

    const out = await handle({
      track_id: "trk_a",
      style_prompt: "acoustic folk",
      preserve_vocals: true,
    });

    expect(coverTrack).toHaveBeenCalledWith({
      trackId: "trk_a",
      stylePrompt: "acoustic folk",
      preserveVocals: true,
    });
    expect(JSON.parse(out)).toEqual({
      type: "audio_url",
      service: "suede_cover",
      url: "https://cdn.suedeai.xyz/cov.mp3",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    coverTrack.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/cover"));
    try {
      await handle({ audio_url: "https://x/y.mp3", style_prompt: "lofi" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
