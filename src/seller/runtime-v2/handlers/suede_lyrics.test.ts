/**
 * Tests for the suede_lyrics v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateLyrics = vi.fn();
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
  generateLyrics,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_lyrics.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  generateLyrics.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_lyrics handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_lyrics")).toBe(handle);
  });

  it("rejects missing prompt", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: prompt/
    );
  });

  it("forwards optional fields to the client", async () => {
    generateLyrics.mockResolvedValueOnce({ lyrics: "[Verse]\nhello\n" });

    const out = await handle({
      prompt: "Late night drive",
      language: "en",
      structure: "verse-chorus-verse",
      rhyme_scheme: "abab",
      explicit_allowed: false,
    });

    expect(generateLyrics).toHaveBeenCalledWith({
      prompt: "Late night drive",
      language: "en",
      structure: "verse-chorus-verse",
      rhyme_scheme: "abab",
      explicit_allowed: false,
    });
    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "text",
      service: "suede_lyrics",
      content: "[Verse]\nhello",
      schemaVersion: "v2-music-1",
    });
  });

  it("accepts a plain-string response from the upstream", async () => {
    generateLyrics.mockResolvedValueOnce("plain text lyrics");

    const out = await handle({ prompt: "hello" });
    expect(JSON.parse(out).content).toBe("plain text lyrics");
  });

  it("throws when upstream returns no usable content", async () => {
    generateLyrics.mockResolvedValueOnce({});
    await expect(handle({ prompt: "x" })).rejects.toThrow(/no content/);
  });

  it("maps BACKEND_UNAVAILABLE on SuedeEndpointUnavailableError", async () => {
    generateLyrics.mockRejectedValueOnce(
      new SuedeEndpointUnavailableError("POST /v1/lyrics")
    );

    try {
      await handle({ prompt: "x" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
