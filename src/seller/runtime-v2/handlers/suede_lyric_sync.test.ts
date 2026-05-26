/**
 * Tests for the suede_lyric_sync v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncLyrics = vi.fn();
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
  syncLyrics,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_lyric_sync.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  syncLyrics.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_lyric_sync handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_lyric_sync")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({ lyrics: "x" })).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("rejects missing lyrics", async () => {
    await expect(handle({ audio_url: "https://x/y.mp3" })).rejects.toThrow(
      /Missing or invalid required field: lyrics/
    );
  });

  it("forwards audioUrl + lyrics + language + format", async () => {
    syncLyrics.mockResolvedValueOnce({ url: "https://cdn/lyrics.lrc" });

    const out = await handle({
      audio_url: "https://x/y.mp3",
      lyrics: "[V1]\nHello",
      language: "en",
      format: "enhanced_lrc",
    });

    expect(syncLyrics).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      lyrics: "[V1]\nHello",
      language: "en",
      format: "enhanced_lrc",
    });
    expect(JSON.parse(out)).toEqual({
      type: "lrc_url",
      service: "suede_lyric_sync",
      url: "https://cdn/lyrics.lrc",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    syncLyrics.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/lyric-sync"));
    try {
      await handle({ audio_url: "https://x/y.mp3", lyrics: "[V]" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
