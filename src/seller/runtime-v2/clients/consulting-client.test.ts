/**
 * Tests for the v2 consulting client (Virtuals Compute gateway).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertReady,
  listConsultingServices,
  runConsultingAnalysis,
} from "./consulting-client.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.VIRTUALS_V2_COMPUTE_API_KEY;
  delete process.env.VIRTUALS_V2_COMPUTE_MODEL;
  delete process.env.VIRTUALS_V2_COMPUTE_BASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("listConsultingServices", () => {
  it("exposes all 7 consulting service templates", () => {
    const services = listConsultingServices().sort();
    expect(services).toEqual(
      [
        "acp_agent_setup",
        "acp_buyer_growth_list",
        "acp_market_arbitrage_report",
        "acp_offer_optimization",
        "acp_performance_audit",
        "acp_x402_promotion_plan",
        "agent_quick_score",
      ].sort(),
    );
  });
});

describe("assertReady", () => {
  it("throws when VIRTUALS_V2_COMPUTE_API_KEY is missing", () => {
    expect(() => assertReady()).toThrow(/VIRTUALS_V2_COMPUTE_API_KEY/);
  });

  it("returns without throwing when key is set", () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";
    expect(() => assertReady()).not.toThrow();
  });
});

describe("runConsultingAnalysis", () => {
  it("rejects unknown service names", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";
    await expect(runConsultingAnalysis("not_a_service", {})).rejects.toThrow(
      /Unknown consulting service/,
    );
  });

  it("throws when API key is missing", async () => {
    await expect(
      runConsultingAnalysis("agent_quick_score", { target: "https://x.y" }),
    ).rejects.toThrow(/VIRTUALS_V2_COMPUTE_API_KEY/);
  });

  it("calls the compute gateway with bearer auth, default URL, and default model", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "report body" } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runConsultingAnalysis("agent_quick_score", {
      target: "https://app.virtuals.io/agents/123",
    });

    expect(result).toBe("report body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://compute.virtuals.io/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("anthropic/claude-haiku-4-5");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain(
      "https://app.virtuals.io/agents/123",
    );
  });

  it("respects VIRTUALS_V2_COMPUTE_BASE_URL and VIRTUALS_V2_COMPUTE_MODEL overrides", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";
    process.env.VIRTUALS_V2_COMPUTE_BASE_URL = "https://gateway.example.com/";
    process.env.VIRTUALS_V2_COMPUTE_MODEL = "openai/gpt-4o-mini";

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runConsultingAnalysis("agent_quick_score", { target: "x" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gateway.example.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("openai/gpt-4o-mini");
  });

  it("throws when the upstream returns a non-2xx", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate-limited", { status: 429 })),
    );

    await expect(
      runConsultingAnalysis("agent_quick_score", { target: "x" }),
    ).rejects.toThrow(/Consulting upstream failed: HTTP 429/);
  });

  it("throws when the upstream returns no content", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      ),
    );

    await expect(
      runConsultingAnalysis("agent_quick_score", { target: "x" }),
    ).rejects.toThrow(/no content/);
  });

  it("trims leading/trailing whitespace from the upstream content", async () => {
    process.env.VIRTUALS_V2_COMPUTE_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "\n  hello  \n" } }],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await runConsultingAnalysis("agent_quick_score", {
      target: "x",
    });
    expect(result).toBe("hello");
  });
});
