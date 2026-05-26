/**
 * Tests for the suede_stems_pro v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extractStems = vi.fn();
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
  extractStems,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_stems_pro.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  extractStems.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_stems_pro handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_stems_pro")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("rejects invalid sample_rate", async () => {
    await expect(
      handle({ audio_url: "https://x/y.mp3", sample_rate: 22050 })
    ).rejects.toThrow(/sample_rate/);
  });

  it("calls extractStems with pro tier and returns zip envelope", async () => {
    extractStems.mockResolvedValueOnce({ url: "https://cdn/stems_hd.zip" });

    const out = await handle({
      audio_url: "https://x/y.wav",
      output_format: "wav",
      sample_rate: 48000,
    });

    expect(extractStems).toHaveBeenCalledWith({
      audioUrl: "https://x/y.wav",
      tier: "pro",
      outputFormat: "wav",
      sampleRate: 48000,
    });
    expect(JSON.parse(out)).toEqual({
      type: "zip_url",
      service: "suede_stems_pro",
      url: "https://cdn/stems_hd.zip",
      quality: "pro",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    extractStems.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/stems-pro"));
    try {
      await handle({ audio_url: "https://x/y.mp3" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
