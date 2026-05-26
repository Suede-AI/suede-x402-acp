/**
 * Tests for the suede_continue v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const continueTrack = vi.fn();
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
  continueTrack,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_continue.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  continueTrack.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_continue handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_continue")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("forwards optional fields", async () => {
    continueTrack.mockResolvedValueOnce({ url: "https://cdn.suedeai.xyz/c.mp3" });

    const out = await handle({
      audio_url: "https://x/y.mp3",
      prompt: "Drop into chorus",
      duration_seconds: 90,
      section_hint: "chorus",
    });

    expect(continueTrack).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      prompt: "Drop into chorus",
      durationSeconds: 90,
      sectionHint: "chorus",
    });
    expect(JSON.parse(out)).toEqual({
      type: "audio_url",
      service: "suede_continue",
      url: "https://cdn.suedeai.xyz/c.mp3",
      schemaVersion: "v2-music-1",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    continueTrack.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/continue"));
    try {
      await handle({ audio_url: "https://x/y.mp3" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
