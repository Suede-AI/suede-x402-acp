/**
 * Tests for the suede_acapella v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extractAcapella = vi.fn();
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
  extractAcapella,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_acapella.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  extractAcapella.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_acapella handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_acapella")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("forwards audioUrl + outputFormat + denoise", async () => {
    extractAcapella.mockResolvedValueOnce({ url: "https://cdn/aca.mp3" });

    const out = await handle({
      audio_url: "https://x/y.mp3",
      output_format: "wav",
      denoise: false,
    });

    expect(extractAcapella).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      outputFormat: "wav",
      denoise: false,
    });
    expect(JSON.parse(out)).toEqual({
      type: "audio_url",
      service: "suede_acapella",
      url: "https://cdn/aca.mp3",
      stem: "vocal",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    extractAcapella.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/acapella"));
    try {
      await handle({ audio_url: "https://x/y.mp3" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
