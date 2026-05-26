// =============================================================================
// Tests for general_video handler.
// HTTP is mocked. We exercise the validation path + the happy-path envelope
// shape returned by the registered handler.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

import { getHandler } from "../dispatch.js";
// Importing the handler registers it.
import "./general_video.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("general_video handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const handler = getHandler("general_video");

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "done",
        videoUrl: "https://cdn.suedeai.ai/v/g.mp4",
        shareUrl: "https://suedeai.ai/v/g",
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is registered on import", () => {
    expect(handler).toBeDefined();
  });

  it("returns the documented envelope on happy path", async () => {
    expect(handler).toBeDefined();
    const raw = await handler!({ prompt: "neon cityscape" });
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      type: "video_url",
      service: "general_video",
      url: "https://cdn.suedeai.ai/v/g.mp4",
      share_url: "https://suedeai.ai/v/g",
      schemaVersion: "v2-video-1",
    });
  });

  it("sends defaults: 16:9 / pro / sound=true", async () => {
    await handler!({ prompt: "neon cityscape" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.prompt).toBe("neon cityscape");
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.mode).toBe("pro");
    expect(body.sound).toBe(true);
  });

  it("passes through image_urls", async () => {
    await handler!({
      prompt: "neon cityscape",
      image_urls: ["https://example.com/ref.png"],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.image_urls).toEqual(["https://example.com/ref.png"]);
  });

  it("rejects missing prompt", async () => {
    await expect(handler!({})).rejects.toThrow(/prompt/);
  });

  it("rejects empty string prompt", async () => {
    await expect(handler!({ prompt: "   " })).rejects.toThrow(/prompt/);
  });

  it("rejects invalid aspect_ratio", async () => {
    await expect(
      handler!({ prompt: "hi", aspect_ratio: "4:3" })
    ).rejects.toThrow(/aspect_ratio/);
  });

  it("rejects invalid mode", async () => {
    await expect(
      handler!({ prompt: "hi", mode: "ultra" })
    ).rejects.toThrow(/mode/);
  });

  it("rejects non-boolean sound", async () => {
    await expect(
      handler!({ prompt: "hi", sound: "yes" })
    ).rejects.toThrow(/sound/);
  });

  it("rejects image_urls that isn't an array", async () => {
    await expect(
      handler!({ prompt: "hi", image_urls: "https://example.com/a.png" })
    ).rejects.toThrow(/image_urls/);
  });
});
