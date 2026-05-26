// =============================================================================
// Tests for suede_video_generation handler (looser, cheaper general tier).
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

import { getHandler } from "../dispatch.js";
import "./suede_video_generation.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("suede_video_generation handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const handler = getHandler("suede_video_generation");

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "done",
        videoUrl: "https://cdn.suedeai.ai/v/s.mp4",
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

  it("uses default duration=10, aspect=16:9, resolution=720p", async () => {
    await handler!({ prompt: "synthwave skyline" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.duration_seconds).toBe(10);
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.resolution).toBe("720p");
  });

  it("accepts camelCase field names (durationSeconds, aspectRatio)", async () => {
    await handler!({
      prompt: "synthwave skyline",
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1024p",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.duration_seconds).toBe(8);
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.resolution).toBe("1024p");
  });

  it("accepts snake_case field names (duration_seconds, aspect_ratio)", async () => {
    await handler!({
      prompt: "synthwave skyline",
      duration_seconds: 6,
      aspect_ratio: "1:1",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.duration_seconds).toBe(6);
    expect(body.aspect_ratio).toBe("1:1");
  });

  it("forwards optional seed", async () => {
    await handler!({ prompt: "synthwave", seed: 42 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.seed).toBe(42);
  });

  it("returns the documented envelope", async () => {
    const raw = await handler!({ prompt: "synthwave skyline" });
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe("video_url");
    expect(parsed.service).toBe("suede_video_generation");
    expect(parsed.url).toBe("https://cdn.suedeai.ai/v/s.mp4");
    expect(parsed.schemaVersion).toBe("v2-video-1");
  });

  it("rejects duration below allowed minimum (4)", async () => {
    await expect(
      handler!({ prompt: "ok", durationSeconds: 2 })
    ).rejects.toThrow(/durationSeconds/);
  });

  it("rejects duration above allowed maximum (30)", async () => {
    await expect(
      handler!({ prompt: "ok", duration_seconds: 60 })
    ).rejects.toThrow(/duration_seconds/);
  });

  it("rejects non-integer duration", async () => {
    await expect(
      handler!({ prompt: "ok", durationSeconds: 8.5 })
    ).rejects.toThrow(/durationSeconds/);
  });

  it("rejects invalid resolution", async () => {
    await expect(
      handler!({ prompt: "ok", resolution: "4K" })
    ).rejects.toThrow(/resolution/);
  });

  it("rejects missing prompt", async () => {
    await expect(handler!({})).rejects.toThrow(/prompt/);
  });
});
