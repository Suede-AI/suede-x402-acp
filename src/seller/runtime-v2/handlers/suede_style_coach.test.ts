/**
 * Tests for the suede_style_coach v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coachStyle = vi.fn();
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
  coachStyle,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_style_coach.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  coachStyle.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_style_coach handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_style_coach")).toBe(handle);
  });

  it("rejects missing prompt", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: prompt/
    );
  });

  it("rejects max_tokens out of range", async () => {
    await expect(
      handle({ prompt: "lofi", max_tokens: 5000 })
    ).rejects.toThrow(/max_tokens must be between 16 and 200/);
  });

  it("forwards prompt + targetUse + maxTokens and unwraps content", async () => {
    coachStyle.mockResolvedValueOnce({ content: "expanded prompt body" });

    const out = await handle({
      prompt: "lofi sad guitar",
      target_use: "music_generation",
      max_tokens: 100,
    });

    expect(coachStyle).toHaveBeenCalledWith({
      prompt: "lofi sad guitar",
      targetUse: "music_generation",
      maxTokens: 100,
    });
    expect(JSON.parse(out)).toEqual({
      type: "text",
      service: "suede_style_coach",
      content: "expanded prompt body",
      schemaVersion: "v2-music-1",
    });
  });

  it("accepts a plain-string upstream response", async () => {
    coachStyle.mockResolvedValueOnce("expanded body");

    const out = await handle({ prompt: "lofi" });
    expect(JSON.parse(out).content).toBe("expanded body");
  });

  it("throws when upstream returns no usable content", async () => {
    coachStyle.mockResolvedValueOnce({});
    await expect(handle({ prompt: "x" })).rejects.toThrow(/no content/);
  });

  it("maps BACKEND_UNAVAILABLE on backend errors", async () => {
    coachStyle.mockRejectedValueOnce(new SuedeEndpointUnavailableError("POST /v1/style-coach"));
    try {
      await handle({ prompt: "lofi" });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
