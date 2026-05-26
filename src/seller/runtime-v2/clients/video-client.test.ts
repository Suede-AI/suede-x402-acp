// =============================================================================
// Tests for the v2 Suede video client.
//
// All HTTP is mocked — production video calls are EXPENSIVE and slow.
// We also force-set SUEDE_API_KEY so assertReady() succeeds without touching
// the real .env. Each test resets fetch + timers between cases.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.SUEDE_API_KEY = process.env.SUEDE_API_KEY ?? "test-suede-key";
process.env.SUEDE_API_BASE_URL =
  process.env.SUEDE_API_BASE_URL ?? "https://app.suedeai.ai";

// Imported after env is set so module-level reads pick up our values.
import {
  assertReady,
  generateVideo,
  _internals,
} from "./video-client.js";

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("video-client / assertReady", () => {
  it("does not throw when SUEDE_API_KEY is set", () => {
    expect(() => assertReady()).not.toThrow();
  });

  it("throws when SUEDE_API_KEY is missing", async () => {
    const original = process.env.SUEDE_API_KEY;
    delete process.env.SUEDE_API_KEY;
    // Re-import the module so it re-reads env. Use dynamic import + cache bust.
    vi.resetModules();
    const fresh = await import("./video-client.js?nokey-" + Date.now());
    try {
      expect(() => fresh.assertReady()).toThrow(/SUEDE_API_KEY/);
    } finally {
      process.env.SUEDE_API_KEY = original;
      vi.resetModules();
    }
  });
});

describe("video-client / buildPayload (internals)", () => {
  it("applies the documented defaults", () => {
    const payload = _internals.buildPayload({ prompt: "hi" });
    expect(payload).toMatchObject({
      prompt: "hi",
      aspect_ratio: "16:9",
      mode: "pro",
      sound: true,
    });
    expect(payload.image_urls).toBeUndefined();
  });

  it("merges image_url into image_urls", () => {
    const payload = _internals.buildPayload({
      prompt: "p",
      image_url: "https://example.com/a.png",
      image_urls: ["https://example.com/b.png"],
    });
    expect(payload.image_urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
  });

  it("drops undefined optional fields rather than serializing undefined", () => {
    const payload = _internals.buildPayload({ prompt: "p" });
    expect("duration_seconds" in payload).toBe(false);
    expect("resolution" in payload).toBe(false);
    expect("seed" in payload).toBe(false);
  });

  it("preserves explicit zero-friendly fields like seed=0", () => {
    const payload = _internals.buildPayload({ prompt: "p", seed: 0 });
    expect(payload.seed).toBe(0);
  });
});

describe("video-client / generateVideo happy path", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
    // Stub out the sleep delay so the test runs fast.
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal(
      "setTimeout",
      ((cb: () => void) => realSetTimeout(cb, 0)) as unknown as typeof setTimeout
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns immediately when create response is already done", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "done",
        videoUrl: "https://cdn.suedeai.ai/v/abc.mp4",
        shareUrl: "https://suedeai.ai/v/abc",
      })
    );
    const result = await generateVideo({ prompt: "hello" });
    expect(result).toEqual({
      url: "https://cdn.suedeai.ai/v/abc.mp4",
      share_url: "https://suedeai.ai/v/abc",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(createUrl).toBe("https://app.suedeai.ai/agent/video?async=true");
    expect(createInit.method).toBe("POST");
    const headers = createInit.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("polls until done using returned statusUrl", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "abc",
          status: "queued",
          statusUrl: "https://app.suedeai.ai/agent/video/abc",
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          result: { url: "https://cdn.suedeai.ai/v/xyz.mp4" },
        })
      );

    const result = await generateVideo({ prompt: "polling test" });
    expect(result.url).toBe("https://cdn.suedeai.ai/v/xyz.mp4");
    expect(result.share_url).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("falls back to constructed status URL when only jobId is returned", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "job-123", status: "queued" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          video_url: "https://cdn.suedeai.ai/v/job-123.mp4",
        })
      );

    const result = await generateVideo({ prompt: "fallback test" });
    expect(result.url).toBe("https://cdn.suedeai.ai/v/job-123.mp4");
    const [, , pollCall] = fetchMock.mock.calls;
    // Second fetch call should be a GET to the constructed status URL.
    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toBe("https://app.suedeai.ai/agent/video/job-123");
    expect(pollInit.method).toBeUndefined(); // GET (no method)
    void pollCall;
  });

  it("anchors relative statusUrl to SUEDE_API_BASE", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "abc",
          status: "queued",
          statusUrl: "/agent/video/abc",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          assetUrl: "https://cdn.suedeai.ai/v/abc.mp4",
        })
      );

    await generateVideo({ prompt: "relative url" });
    const [pollUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toBe("https://app.suedeai.ai/agent/video/abc");
  });
});

describe("video-client / generateVideo error paths", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal(
      "setTimeout",
      ((cb: () => void) => realSetTimeout(cb, 0)) as unknown as typeof setTimeout
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects empty prompt before hitting the network", async () => {
    await expect(
      generateVideo({ prompt: "   " as string })
    ).rejects.toThrow(/non-empty prompt/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on non-2xx create response", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("backend exploded", 502));
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /Suede video create failed: HTTP 502/
    );
  });

  it("throws if create returns status=failed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "failed", error: "model refused" })
    );
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /failed on create/
    );
  });

  it("throws if create returns done but no asset URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "done" }));
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /done but no URL/
    );
  });

  it("throws if create returns neither statusUrl nor jobId", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "queued" })
    );
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /neither statusUrl nor jobId/
    );
  });

  it("throws when poll surfaces status=failed", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "abc", status: "queued" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "failed", error: "out of credits" })
      );
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /out of credits/
    );
  });

  it("bails out cleanly when poll hits 401", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "abc", status: "queued" })
      )
      .mockResolvedValueOnce(textResponse("nope", 401));
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /authorization rejected/
    );
  });

  it("bails out cleanly when poll hits 404", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "abc", status: "queued" })
      )
      .mockResolvedValueOnce(textResponse("gone", 404));
    await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(
      /job not found/
    );
  });

  it("times out cleanly after POLL_MAX_ATTEMPTS", async () => {
    // First call = create, every subsequent call returns running.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("?async=true")) {
        return Promise.resolve(
          jsonResponse({ jobId: "abc", status: "queued" })
        );
      }
      return Promise.resolve(jsonResponse({ status: "running" }));
    });

    // Force a smaller maxAttempts for this test — the real value is 300
    // (25 minutes) which would take forever even with zero-delay setTimeout.
    const originalMax = _internals.pollConfig.maxAttempts;
    _internals.pollConfig.maxAttempts = 3;

    try {
      await expect(generateVideo({ prompt: "hi" })).rejects.toThrow(/timed out/);
    } finally {
      _internals.pollConfig.maxAttempts = originalMax;
    }
  });
});
