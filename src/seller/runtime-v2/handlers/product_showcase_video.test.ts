// =============================================================================
// Tests for product_showcase_video handler.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

import { getHandler } from "../dispatch.js";
import "./product_showcase_video.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("product_showcase_video handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const handler = getHandler("product_showcase_video");

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "done",
        videoUrl: "https://cdn.suedeai.ai/v/p.mp4",
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

  it("uses defaults: 16:9 / pro / sound=false, default prompt when omitted", async () => {
    await handler!({ image_url: "https://example.com/p.png" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.mode).toBe("pro");
    expect(body.sound).toBe(false);
    expect(body.prompt).toMatch(/Cinematic product showcase/);
    expect(body.image_urls).toEqual(["https://example.com/p.png"]);
  });

  it("returns the documented envelope", async () => {
    const raw = await handler!({ image_url: "https://example.com/p.png" });
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe("video_url");
    expect(parsed.service).toBe("product_showcase_video");
    expect(parsed.url).toBe("https://cdn.suedeai.ai/v/p.mp4");
    expect(parsed.schemaVersion).toBe("v2-video-1");
  });

  it("accepts image_urls array as alternative to image_url", async () => {
    await handler!({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.image_urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
  });

  it("rejects request with NO image reference", async () => {
    await expect(handler!({ prompt: "anything" })).rejects.toThrow(
      /image_url or image_urls/
    );
  });

  it("rejects an empty image_urls array (must have at least one URL)", async () => {
    await expect(handler!({ image_urls: [] })).rejects.toThrow(
      /image_url or image_urls/
    );
  });

  it("rejects invalid aspect_ratio", async () => {
    await expect(
      handler!({
        image_url: "https://example.com/p.png",
        aspect_ratio: "panorama",
      })
    ).rejects.toThrow(/aspect_ratio/);
  });
});
