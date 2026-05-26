/**
 * Tests for the suede_extend v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extendTrack = vi.fn();
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
  extendTrack,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_extend.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  extendTrack.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_extend handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_extend")).toBe(handle);
  });

  it("rejects when both track_id and audio_url are missing", async () => {
    await expect(handle({ duration_seconds: 30 })).rejects.toThrow(
      /at least one of: audio_url, track_id/
    );
  });

  it("rejects missing duration_seconds", async () => {
    await expect(
      handle({ audio_url: "https://x/y.mp3" })
    ).rejects.toThrow(/duration_seconds/);
  });

  it("rejects out-of-range duration_seconds", async () => {
    await expect(
      handle({ audio_url: "https://x/y.mp3", duration_seconds: 9999 })
    ).rejects.toThrow(/duration_seconds must be between 5 and 240/);
  });

  it("forwards trackId, durationSeconds, and prompt", async () => {
    extendTrack.mockResolvedValueOnce({ url: "https://cdn.suedeai.xyz/ext.mp3" });

    const out = await handle({
      track_id: "trk_x",
      duration_seconds: 60,
      prompt: "Build to a drop",
    });

    expect(extendTrack).toHaveBeenCalledWith({
      trackId: "trk_x",
      durationSeconds: 60,
      prompt: "Build to a drop",
    });
    const env = JSON.parse(out);
    expect(env).toEqual({
      type: "audio_url",
      service: "suede_extend",
      url: "https://cdn.suedeai.xyz/ext.mp3",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    extendTrack.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/extend"));
    try {
      await handle({ audio_url: "https://x/y.mp3", duration_seconds: 30 });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
