/**
 * Tests for the suede_audio_analyze v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analyzeAudio = vi.fn();
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
  analyzeAudio,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_audio_analyze.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  analyzeAudio.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_audio_analyze handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_audio_analyze")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("forwards audioUrl and returns analysis envelope", async () => {
    analyzeAudio.mockResolvedValueOnce({
      key: "C minor",
      tempo: 92,
      energy: 0.78,
      mood: ["wistful"],
    });

    const out = await handle({ audio_url: "https://x/y.mp3" });

    expect(analyzeAudio).toHaveBeenCalledWith({ audioUrl: "https://x/y.mp3" });

    const env = JSON.parse(out);
    expect(env.type).toBe("json");
    expect(env.service).toBe("suede_audio_analyze");
    expect(env.analysis).toEqual({
      key: "C minor",
      tempo: 92,
      energy: 0.78,
      mood: ["wistful"],
    });
    expect(env.schemaVersion).toBe("v2-music-1");
  });

  it("wraps a non-object response", async () => {
    analyzeAudio.mockResolvedValueOnce("raw scalar");
    const out = await handle({ audio_url: "https://x/y.mp3" });
    expect(JSON.parse(out).analysis).toEqual({ value: "raw scalar" });
  });

  it("maps BACKEND_UNAVAILABLE on SuedeInternalRouteMissingError", async () => {
    analyzeAudio.mockRejectedValueOnce(new SuedeInternalRouteMissingError("POST /v1/analyze"));
    try {
      await handle({ audio_url: "https://x/y.mp3" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
