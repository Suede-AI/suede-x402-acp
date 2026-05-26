/**
 * Tests for the agent_quick_score v2 handler.
 *
 * The handler now resolves the buyer's target to a structured ACP profile
 * before calling the LLM. These tests mock both the consulting client and the
 * ACP resolver so we can assert:
 *   - the resolver is called with the buyer's target (trimmed)
 *   - the LLM is given the STRUCTURED profile, not the raw target string
 *   - an unresolved target short-circuits to a TARGET_UNRESOLVED error envelope
 *   - the success envelope carries scoringMethod + profileId metadata
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();
const resolveAcpProfile = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

vi.mock("../clients/acp-resolver.js", () => ({
  resolveAcpProfile,
}));

// Import after mocks so the handler picks up the mocked modules.
const { handle } = await import("./agent_quick_score.js");
const { getHandler } = await import("../dispatch.js");

const PROFILE_FIXTURE = {
  resolved: true as const,
  agent: {
    id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    name: "Producer by Suede Labs",
    description: "Performance engine for agent-commerce sellers.",
    walletEvm: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    walletSol: "GC45DbpqE58s1zXuUQf8ohaU32JYAgfGkzUJDzGHsu4i",
    cluster: "OPENCLAW",
    consoleEnabled: false,
    createdAt: "2026-05-18T05:31:18.728Z",
    lastActiveAt: "2999-12-31T00:00:00.000Z",
    isHidden: false,
    builderCode: "bc_zw5d1a2s",
  },
  offerings: [
    {
      name: "agent_quick_score",
      description: "Rapid scorecard",
      deliverable: "Markdown scorecard",
      priceUsd: 3,
      slaMinutes: 5,
      requirementSchema: { required: ["target"] },
      requiredFunds: false,
      hide: false,
      subscriptionTierCount: 0,
    },
  ],
  resources: [
    {
      name: "suede_performance_engine",
      url: "https://acp.suedeai.ai",
      paramsSchemaPresent: false,
    },
  ],
  chains: [
    {
      chainId: 8453,
      tokenAddress: "0x22BAC05Ce5954d64876536B7BBCB98651950ADBD",
      tokenSymbol: "SVID",
      erc8004AgentId: null,
      active: true,
    },
  ],
};

beforeEach(() => {
  runConsultingAnalysis.mockReset();
  resolveAcpProfile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent_quick_score handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("agent_quick_score")).toBe(handle);
  });

  it("throws when `target` is missing", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: target/,
    );
    expect(resolveAcpProfile).not.toHaveBeenCalled();
  });

  it("throws when `target` is blank", async () => {
    await expect(handle({ target: "   " })).rejects.toThrow(
      /Missing or invalid required field: target/,
    );
  });

  it("throws when `target` is not a string", async () => {
    await expect(
      handle({ target: 42 } as Record<string, unknown>),
    ).rejects.toThrow(/Missing or invalid required field: target/);
  });

  it("resolves the target and passes the STRUCTURED profile (not URL) to the LLM", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# scorecard body");

    const out = await handle({
      target: " https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2 ",
    });

    expect(resolveAcpProfile).toHaveBeenCalledWith(
      "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    expect(runConsultingAnalysis).toHaveBeenCalledTimes(1);
    const [service, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(service).toBe("agent_quick_score");
    expect(payload).toHaveProperty("profile");
    const profile = payload.profile as Record<string, unknown>;
    expect(profile).toHaveProperty("agent");
    expect(profile).toHaveProperty("offerings");
    expect(profile).toHaveProperty("resources");
    expect(profile).toHaveProperty("chains");
    // Critically: the raw target string is NOT forwarded to the LLM.
    expect(payload).not.toHaveProperty("target");

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "agent_quick_score",
      content: "# scorecard body",
      schemaVersion: "v2-consulting-1",
      scoringMethod: "acp-profile-only",
      profileId: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    });
  });

  it("returns a TARGET_UNRESOLVED envelope when the resolver fails", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason:
        "Unable to resolve target to a Virtuals ACP agent. Provide a Virtuals agent URL, UUID, or EVM wallet address.",
      inputType: "unknown",
    });

    const out = await handle({ target: "hello world" });

    expect(runConsultingAnalysis).not.toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "error",
      service: "agent_quick_score",
      code: "TARGET_UNRESOLVED",
      message:
        "Unable to resolve target to a Virtuals ACP agent. Provide a Virtuals agent URL, UUID, or EVM wallet address.",
      retryable: false,
      schemaVersion: "v2-consulting-1",
    });
  });

  it("returns a TARGET_UNRESOLVED envelope for a v1 numeric id we cannot enrich", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason:
        "v1 agent — limited ACP data. Provide a Virtuals v2 agent UUID or EVM wallet to score this agent.",
      inputType: "url",
    });

    const out = await handle({
      target: "https://app.virtuals.io/virtuals/2960",
    });

    const envelope = JSON.parse(out);
    expect(envelope.code).toBe("TARGET_UNRESOLVED");
    expect(envelope.message).toMatch(/v1 agent/);
    expect(envelope.retryable).toBe(false);
  });
});
