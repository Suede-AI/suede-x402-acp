/**
 * Tests for the suede_master_wav v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const masterWav = vi.fn();
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
  masterWav,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_master_wav.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  masterWav.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_master_wav handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_master_wav")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("rejects non-numeric target_loudness_lufs", async () => {
    await expect(
      handle({ audio_url: "https://x/y.wav", target_loudness_lufs: "loud" })
    ).rejects.toThrow(/target_loudness_lufs must be a number/);
  });

  it("rejects out-of-range target_loudness_lufs", async () => {
    await expect(
      handle({ audio_url: "https://x/y.wav", target_loudness_lufs: 0 })
    ).rejects.toThrow(/target_loudness_lufs must be between -23 and -6/);
  });

  it("forwards audioUrl + targetLoudnessLufs + outputFormat + preset", async () => {
    masterWav.mockResolvedValueOnce({ url: "https://cdn/master.wav" });

    const out = await handle({
      audio_url: "https://x/y.wav",
      target_loudness_lufs: -14,
      output_format: "wav",
      preset: "neutral",
    });

    expect(masterWav).toHaveBeenCalledWith({
      audioUrl: "https://x/y.wav",
      targetLoudnessLufs: -14,
      outputFormat: "wav",
      preset: "neutral",
    });
    expect(JSON.parse(out)).toEqual({
      type: "wav_url",
      service: "suede_master_wav",
      url: "https://cdn/master.wav",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    masterWav.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/mastering"));
    try {
      await handle({ audio_url: "https://x/y.wav" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
