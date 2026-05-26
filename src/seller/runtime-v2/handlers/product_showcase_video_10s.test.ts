// =============================================================================
// Tests for product_showcase_video_10s handler (premium tier).
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

import { getHandler } from "../dispatch.js";
import "./product_showcase_video_10s.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("product_showcase_video_10s handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const handler = getHandler("product_showcase_video_10s");

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "done",
        videoUrl: "https://cdn.suedeai.ai/v/p10.mp4",
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

  it("FORCES duration_seconds=10 and mode=pro even if caller tries to override mode", async () => {
    await handler!({
      image_url: "https://example.com/p.png",
      mode: "std",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.duration_seconds).toBe(10);
    expect(body.mode).toBe("pro");
  });

  it("uses premium default prompt when none supplied", async () => {
    await handler!({ image_url: "https://example.com/p.png" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.prompt).toMatch(/Premium cinematic product showcase/);
  });

  it("returns service=product_showcase_video_10s in envelope", async () => {
    const raw = await handler!({ image_url: "https://example.com/p.png" });
    const parsed = JSON.parse(raw);
    expect(parsed.service).toBe("product_showcase_video_10s");
    expect(parsed.type).toBe("video_url");
    expect(parsed.schemaVersion).toBe("v2-video-1");
  });

  it("rejects request with no image reference", async () => {
    await expect(handler!({ prompt: "just a prompt" })).rejects.toThrow(
      /image_url or image_urls/
    );
  });

  it("allows aspect_ratio override", async () => {
    await handler!({
      image_url: "https://example.com/p.png",
      aspect_ratio: "9:16",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.aspect_ratio).toBe("9:16");
  });

  it("allows sound override to true", async () => {
    await handler!({
      image_url: "https://example.com/p.png",
      sound: true,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sound).toBe(true);
  });

  it("rejects non-string image_url", async () => {
    await expect(
      handler!({ image_url: 42 })
    ).rejects.toThrow(/image_url/);
  });

  it("rejects non-array image_urls", async () => {
    await expect(
      handler!({ image_urls: "https://example.com/p.png" })
    ).rejects.toThrow(/image_urls/);
  });

  it("rejects invalid aspect_ratio enum value", async () => {
    await expect(
      handler!({
        image_url: "https://example.com/p.png",
        aspect_ratio: "panorama",
      })
    ).rejects.toThrow(/aspect_ratio/);
  });

  it("rejects non-boolean sound", async () => {
    await expect(
      handler!({
        image_url: "https://example.com/p.png",
        sound: 1,
      })
    ).rejects.toThrow(/sound/);
  });

  it("accepts the explicit prompt instead of falling back to default", async () => {
    await handler!({
      image_url: "https://example.com/p.png",
      prompt: "extreme luxury orbit shot",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.prompt).toBe("extreme luxury orbit shot");
  });

  it("filters empty strings out of image_urls and rejects if all are empty", async () => {
    await expect(handler!({ image_urls: ["", "   "] })).rejects.toThrow(
      /image_url or image_urls/
    );
  });

  it("accepts image_urls only (no image_url)", async () => {
    await handler!({
      image_urls: ["https://example.com/x.png"],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.image_urls).toEqual(["https://example.com/x.png"]);
  });
});
