/**
 * Tests for the suede_music_generation v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMusic = vi.fn();
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
  generateMusic,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_music_generation.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  generateMusic.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_music_generation handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_music_generation")).toBe(handle);
  });

  it("rejects missing prompt", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: prompt/
    );
  });

  it("rejects blank prompt", async () => {
    await expect(handle({ prompt: "   " })).rejects.toThrow(
      /Missing or invalid required field: prompt/
    );
  });

  it("rejects non-string prompt", async () => {
    await expect(
      handle({ prompt: 42 } as Record<string, unknown>)
    ).rejects.toThrow(/Missing or invalid required field: prompt/);
  });

  it("rejects custom_mode=true with no lyrics", async () => {
    await expect(
      handle({ prompt: "synthwave", custom_mode: true })
    ).rejects.toThrow(/lyrics is required when custom_mode is true/);
  });

  it("rejects invalid vocal_gender", async () => {
    await expect(
      handle({ prompt: "synthwave", vocal_gender: "x" })
    ).rejects.toThrow(/vocal_gender must be 'm' or 'f'/);
  });

  it("rejects out-of-range durationSeconds", async () => {
    await expect(
      handle({ prompt: "synthwave", durationSeconds: 9999 })
    ).rejects.toThrow(/durationSeconds must be between 5 and 120/);
  });

  it("rejects non-integer durationSeconds", async () => {
    await expect(
      handle({ prompt: "synthwave", durationSeconds: 12.5 })
    ).rejects.toThrow(/durationSeconds must be an integer/);
  });

  it("calls generateMusic with the buyer fields and returns a v2 envelope", async () => {
    generateMusic.mockResolvedValueOnce({
      trackId: "trk_1",
      shareUrl: "https://share.suedeai.ai/x",
      assetUrl: "https://cdn.suedeai.xyz/x.mp3",
      title: "Neon Skyline",
      imageUrl: "https://img.suedeai.xyz/x.jpg",
      provenance: { fingerprint: "abc" },
    });

    const out = await handle({
      prompt: "  upbeat 80s synthwave  ",
      durationSeconds: 30,
      style: "synthwave",
      make_instrumental: true,
      tags: "neon, drive",
    });

    expect(generateMusic).toHaveBeenCalledTimes(1);
    expect(generateMusic).toHaveBeenCalledWith({
      prompt: "upbeat 80s synthwave",
      durationSeconds: 30,
      style: "synthwave",
      make_instrumental: true,
      tags: "neon, drive",
    });

    const envelope = JSON.parse(out);
    expect(envelope).toMatchObject({
      type: "audio_url",
      service: "suede_music_generation",
      url: "https://share.suedeai.ai/x",
      title: "Neon Skyline",
      share_url: "https://share.suedeai.ai/x",
      track_id: "trk_1",
      image_url: "https://img.suedeai.xyz/x.jpg",
      provenance: { fingerprint: "abc" },
      schemaVersion: "v2-music-1",
    });
  });

  it("falls back to assetUrl when shareUrl is absent", async () => {
    generateMusic.mockResolvedValueOnce({
      trackId: "trk_2",
      assetUrl: "https://cdn.suedeai.xyz/y.mp3",
    });

    const out = await handle({ prompt: "lofi" });
    const envelope = JSON.parse(out);

    expect(envelope.url).toBe("https://cdn.suedeai.xyz/y.mp3");
    expect(envelope.share_url).toBeUndefined();
  });

  it("falls back to suede:track id when no url is present", async () => {
    generateMusic.mockResolvedValueOnce({ trackId: "trk_3" });

    const out = await handle({ prompt: "ambient" });
    const envelope = JSON.parse(out);

    expect(envelope.url).toBe("suede:track:trk_3");
  });

  it("maps SuedeEndpointUnavailableError to BACKEND_UNAVAILABLE", async () => {
    generateMusic.mockRejectedValueOnce(
      new SuedeEndpointUnavailableError("POST /api/agent/generate")
    );

    try {
      await handle({ prompt: "lofi" });
      throw new Error("handler did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });

  it("maps SuedeInternalRouteMissingError to BACKEND_UNAVAILABLE", async () => {
    generateMusic.mockRejectedValueOnce(
      new SuedeInternalRouteMissingError("POST /api/agent/generate")
    );

    try {
      await handle({ prompt: "lofi" });
      throw new Error("handler did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });

  it("propagates unrelated errors verbatim", async () => {
    generateMusic.mockRejectedValueOnce(new Error("network timeout"));

    await expect(handle({ prompt: "lofi" })).rejects.toThrow(/network timeout/);
  });
});
