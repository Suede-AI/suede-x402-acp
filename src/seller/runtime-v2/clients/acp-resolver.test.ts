/**
 * Tests for the ACP profile resolver.
 *
 * All network is mocked — these tests must not touch api.acp.virtuals.io.
 * Each case asserts how parseTarget classifies the input and what URL the
 * resolver hits (UUID lookup vs wallet vs search). The projection layer is
 * exercised against a representative fixture mirroring the real API shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAcpProfile } from "./acp-resolver.js";

/**
 * Minimal fixture mirroring the shape returned by api.acp.virtuals.io. Kept
 * intentionally small so that test diffs stay readable; the real payload
 * includes ~25 more nested fields the resolver ignores.
 */
const FIXTURE_AGENT = {
  id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
  name: "Producer by Suede Labs",
  description: "Suede ACP/x402 Performance Engine for agent-commerce sellers.",
  imageUrl: "https://cdn.example/avatar.png",
  walletAddress: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
  solWalletAddress: "GC45DbpqE58s1zXuUQf8ohaU32JYAgfGkzUJDzGHsu4i",
  role: "HYBRID",
  cluster: "OPENCLAW",
  tag: "OPENCLAW",
  createdAt: "2026-05-18T05:31:18.728Z",
  updatedAt: "2026-05-26T19:15:04.563Z",
  lastActiveAt: "2999-12-31T00:00:00.000Z",
  isHidden: false,
  builderCode: "bc_zw5d1a2s",
  consoleAgentId: null,
  chains: [
    {
      chainId: 8453,
      tokenAddress: "0x22BAC05Ce5954d64876536B7BBCB98651950ADBD",
      symbol: "SVID",
      active: true,
      erc8004AgentId: null,
    },
  ],
  offerings: [
    {
      name: "suede_stems_pro",
      description: "HD stem splitter",
      deliverable: "ZIP URL with HD stems",
      priceType: "USDC",
      priceValue: 3,
      slaMinutes: 5,
      requirements: { type: "object", required: ["audio_url"], properties: {} },
      requiredFunds: false,
      isHidden: false,
      subscriptions: [],
    },
    {
      name: "agent_quick_score",
      description: "Rapid scorecard",
      deliverable: "Markdown scorecard",
      priceType: "USDC",
      priceValue: 3,
      slaMinutes: 5,
      requirements: { type: "object", required: ["target"], properties: {} },
      requiredFunds: false,
      isHidden: false,
      subscriptions: [{ tier: "monthly" }, { tier: "annual" }],
    },
  ],
  resources: [
    {
      name: "suede_performance_engine",
      description: "Performance Engine landing",
      url: "https://acp.suedeai.ai",
      params: { type: "object", required: [], properties: {} },
    },
    {
      name: "producer_runtime",
      description: "Runtime URL",
      url: "https://producer.suedeai.ai",
      params: { type: "object", required: ["target"], properties: { target: {} } },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env.ACP_API_BASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolveAcpProfile / target parsing", () => {
  it("classifies a v2 URL and hits the UUID endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: FIXTURE_AGENT }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile(
      "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.acp.virtuals.io/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
    expect(result.resolved).toBe(true);
  });

  it("accepts a bare UUID", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: FIXTURE_AGENT }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile(
      "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.acp.virtuals.io/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
    expect(result.resolved).toBe(true);
  });

  it("accepts a UUID with uppercase characters and lowercases it", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: FIXTURE_AGENT }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await resolveAcpProfile("019E3991-374D-75F3-A6B8-17FF309B4CD2");

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.acp.virtuals.io/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
  });

  it("classifies a 0x EVM wallet and hits the wallet endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: FIXTURE_AGENT }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile(
      "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.acp.virtuals.io/agents/wallet/0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    );
    expect(result.resolved).toBe(true);
  });

  it("returns a graceful v1-limited marker for v1 URLs that don't match", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile(
      "https://app.virtuals.io/virtuals/2960",
    );

    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toMatch(/v1 agent/);
      expect(result.inputType).toBe("url");
    }
  });

  it("returns unresolved + reason for nonsense input", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: null }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile("hello world");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toMatch(/Unable to resolve/);
      expect(result.inputType).toBe("unknown");
    }
  });

  it("returns unresolved when UUID lookup 404s", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAcpProfile(
      "00000000-0000-7000-8000-000000000000",
    );

    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toMatch(/No Virtuals ACP agent found/);
      expect(result.inputType).toBe("uuid");
    }
  });

  it("propagates a thrown error on a 5xx upstream", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveAcpProfile("019e3991-374d-75f3-a6b8-17ff309b4cd2"),
    ).rejects.toThrow(/ACP upstream failed: HTTP 503/);
  });

  it("honours ACP_API_BASE_URL override", async () => {
    process.env.ACP_API_BASE_URL = "https://mirror.example/";

    // Re-import so the module re-reads the env override.
    vi.resetModules();
    const fresh = await import(
      "./acp-resolver.js?override-" + Date.now()
    );

    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: FIXTURE_AGENT }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fresh.resolveAcpProfile("019e3991-374d-75f3-a6b8-17ff309b4cd2");

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://mirror.example/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    vi.resetModules();
  });
});

describe("resolveAcpProfile / projection", () => {
  it("maps the upstream agent into the tight summary shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: FIXTURE_AGENT })),
    );

    const result = await resolveAcpProfile(
      "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    expect(result.resolved).toBe(true);
    if (!result.resolved) return; // type narrowing

    expect(result.agent).toEqual({
      id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
      name: "Producer by Suede Labs",
      description: "Suede ACP/x402 Performance Engine for agent-commerce sellers.",
      walletEvm: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
      walletSol: "GC45DbpqE58s1zXuUQf8ohaU32JYAgfGkzUJDzGHsu4i",
      cluster: "OPENCLAW",
      consoleEnabled: false,
      createdAt: "2026-05-18T05:31:18.728Z",
      lastActiveAt: "2999-12-31T00:00:00.000Z",
      isHidden: false,
      builderCode: "bc_zw5d1a2s",
    });

    expect(result.offerings).toHaveLength(2);
    expect(result.offerings[0]).toMatchObject({
      name: "suede_stems_pro",
      priceUsd: 3,
      slaMinutes: 5,
      hide: false,
      requiredFunds: false,
      subscriptionTierCount: 0,
    });
    expect(result.offerings[1].subscriptionTierCount).toBe(2);

    expect(result.resources).toHaveLength(2);
    expect(result.resources[0].paramsSchemaPresent).toBe(false);
    expect(result.resources[1].paramsSchemaPresent).toBe(true);

    expect(result.chains).toEqual([
      {
        chainId: 8453,
        tokenAddress: "0x22BAC05Ce5954d64876536B7BBCB98651950ADBD",
        tokenSymbol: "SVID",
        erc8004AgentId: null,
        active: true,
      },
    ]);
  });

  it("treats consoleAgentId UUID as console-enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            ...FIXTURE_AGENT,
            consoleAgentId: "019e3991-aaaa-7000-8000-000000000000",
          },
        }),
      ),
    );

    const result = await resolveAcpProfile(
      "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.agent.consoleEnabled).toBe(true);
    }
  });

  it("coerces string priceValue to a number, defaults missing slaMinutes to 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            ...FIXTURE_AGENT,
            offerings: [
              {
                name: "weird_offering",
                description: "edge case",
                deliverable: null,
                priceType: "USDC",
                priceValue: "12.5",
                slaMinutes: null,
                requirements: null,
                requiredFunds: null,
                isHidden: null,
                subscriptions: null,
              },
            ],
          },
        }),
      ),
    );

    const result = await resolveAcpProfile(
      "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
    expect(result.resolved).toBe(true);
    if (!result.resolved) return;

    expect(result.offerings[0]).toMatchObject({
      name: "weird_offering",
      priceUsd: 12.5,
      slaMinutes: 0,
      hide: false,
      requiredFunds: false,
      subscriptionTierCount: 0,
      requirementSchema: {},
    });
    expect(result.offerings[0].deliverable).toBeUndefined();
  });

  it("handles a totally sparse agent without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            id: "019e0000-0000-7000-8000-000000000000",
            name: "Bare Agent",
            walletAddress: "0xabc",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    );

    const result = await resolveAcpProfile(
      "019e0000-0000-7000-8000-000000000000",
    );
    expect(result.resolved).toBe(true);
    if (!result.resolved) return;

    expect(result.offerings).toEqual([]);
    expect(result.resources).toEqual([]);
    expect(result.chains).toEqual([]);
    expect(result.agent.isHidden).toBe(false);
    expect(result.agent.consoleEnabled).toBe(false);
  });
});
