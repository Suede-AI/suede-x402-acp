/**
 * Tests for the suede_voice_cover v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const voiceCover = vi.fn();
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
  voiceCover,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_voice_cover.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  voiceCover.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_voice_cover handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_voice_cover")).toBe(handle);
  });

  it("rejects missing audio_url", async () => {
    await expect(handle({ voice_id: "v_1" })).rejects.toThrow(
      /Missing or invalid required field: audio_url/
    );
  });

  it("rejects when both voice_id and reference_voice_url are missing", async () => {
    await expect(
      handle({ audio_url: "https://x/y.mp3" })
    ).rejects.toThrow(/at least one of: voice_id, reference_voice_url/);
  });

  it("forwards audioUrl + voiceId + rightsAttestation", async () => {
    voiceCover.mockResolvedValueOnce({ url: "https://cdn.suedeai.xyz/vox.mp3" });

    const out = await handle({
      audio_url: "https://x/y.mp3",
      voice_id: "voice_x",
      rights_attestation: true,
    });

    expect(voiceCover).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      voiceId: "voice_x",
      rightsAttestation: true,
    });
    expect(JSON.parse(out)).toEqual({
      type: "audio_url",
      service: "suede_voice_cover",
      url: "https://cdn.suedeai.xyz/vox.mp3",
      schemaVersion: "v2-music-1",
    });
  });

  it("accepts reference_voice_url as the voice identifier", async () => {
    voiceCover.mockResolvedValueOnce({ url: "https://cdn/vox.mp3" });

    await handle({
      audio_url: "https://x/y.mp3",
      reference_voice_url: "https://x/ref.wav",
    });
    expect(voiceCover).toHaveBeenCalledWith({
      audioUrl: "https://x/y.mp3",
      referenceVoiceUrl: "https://x/ref.wav",
    });
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    voiceCover.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/vox"));
    try {
      await handle({ audio_url: "https://x/y.mp3", voice_id: "v1" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
