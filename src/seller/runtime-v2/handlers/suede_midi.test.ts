/**
 * Tests for the suede_midi v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transcribeMidi = vi.fn();
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
  transcribeMidi,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_midi.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  transcribeMidi.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_midi handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_midi")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("forwards audioUrl + instrument + quantize", async () => {
    transcribeMidi.mockResolvedValueOnce({ url: "https://cdn/track.mid" });

    const out = await handle({
      audio_url: "https://x/y.mp3",
      instrument: "piano",
      quantize: "1/16",
    });

    expect(transcribeMidi).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      instrument: "piano",
      quantize: "1/16",
    });
    expect(JSON.parse(out)).toEqual({
      type: "midi_url",
      service: "suede_midi",
      url: "https://cdn/track.mid",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    transcribeMidi.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/midi"));
    try {
      await handle({ audio_url: "https://x/y.mp3" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
