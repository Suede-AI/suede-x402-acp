// =============================================================================
// Tests for meme_video handler.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

import { getHandler } from "../dispatch.js";
import "./meme_video.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("meme_video handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const handler = getHandler("meme_video");

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "done",
        url: "https://cdn.suedeai.ai/v/m.mp4",
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

  it("forces meme-optimized defaults: 9:16 / std / sound=true", async () => {
    await handler!({ prompt: "agent learns x402" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.mode).toBe("std");
    expect(body.sound).toBe(true);
  });

  it("returns envelope without share_url when backend omits one", async () => {
    const raw = await handler!({ prompt: "agent learns x402" });
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe("video_url");
    expect(parsed.service).toBe("meme_video");
    expect(parsed.url).toBe("https://cdn.suedeai.ai/v/m.mp4");
    expect(parsed.schemaVersion).toBe("v2-video-1");
    expect(parsed.share_url).toBeUndefined();
  });

  it("accepts an optional starting image_url and forwards it", async () => {
    await handler!({
      prompt: "agent reacts",
      image_url: "https://example.com/template.png",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.image_urls).toEqual(["https://example.com/template.png"]);
  });

  it("allows caller to override aspect_ratio to widescreen", async () => {
    await handler!({ prompt: "wide meme", aspect_ratio: "16:9" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.aspect_ratio).toBe("16:9");
  });

  it("rejects missing prompt", async () => {
    await expect(handler!({})).rejects.toThrow(/prompt/);
  });

  it("rejects invalid aspect_ratio", async () => {
    await expect(
      handler!({ prompt: "ok", aspect_ratio: "21:9" })
    ).rejects.toThrow(/aspect_ratio/);
  });

  it("rejects non-string image_url", async () => {
    await expect(
      handler!({ prompt: "ok", image_url: 42 })
    ).rejects.toThrow(/image_url/);
  });
});
