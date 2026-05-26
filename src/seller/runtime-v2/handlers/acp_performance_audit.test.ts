/**
 * Tests for the acp_performance_audit v2 handler (Category 1: AUDIT).
 *
 * Asserts:
 *   - required-field validation still throws
 *   - resolver is called when an identifier is provided (URL/UUID/wallet)
 *   - resolver is NOT called when the input is free-text
 *   - successful resolution → structured profile forwarded to LLM, raw
 *     identifier string is NOT forwarded
 *   - resolver failure → falls back to text-only audit with the failure note
 *   - envelope carries `scoringMethod` ("acp-profile-only" vs "text-only")
 *     and `profileId` only when resolution succeeded
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

const { handle } = await import("./acp_performance_audit.js");
const { getHandler } = await import("../dispatch.js");

const PROFILE_FIXTURE = {
  resolved: true as const,
  agent: {
    id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    name: "Producer by Suede Labs",
    description: "Performance engine for agent-commerce sellers.",
    walletEvm: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    walletSol: null,
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
  resources: [],
  chains: [],
};

beforeEach(() => {
  runConsultingAnalysis.mockReset();
  resolveAcpProfile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("acp_performance_audit handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_performance_audit")).toBe(handle);
  });

  it("throws when `acp_profile_or_offer` is missing", async () => {
    await expect(
      handle({ performance_goal: "increase revenue" }),
    ).rejects.toThrow(/Missing or invalid required field: acp_profile_or_offer/);
    expect(resolveAcpProfile).not.toHaveBeenCalled();
  });

  it("throws when `performance_goal` is missing", async () => {
    await expect(
      handle({ acp_profile_or_offer: "https://x.y" }),
    ).rejects.toThrow(/Missing or invalid required field: performance_goal/);
    expect(resolveAcpProfile).not.toHaveBeenCalled();
  });

  it("resolves the URL identifier and passes structured profile to the LLM", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# audit memo");

    const out = await handle({
      acp_profile_or_offer:
        "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
      performance_goal: "double weekly job buys",
      current_metrics: "12 jobs / wk",
      constraints: "no token-price claims",
    });

    expect(resolveAcpProfile).toHaveBeenCalledTimes(1);
    expect(resolveAcpProfile).toHaveBeenCalledWith(
      "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );

    expect(runConsultingAnalysis).toHaveBeenCalledTimes(1);
    const [service, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(service).toBe("acp_performance_audit");
    expect(payload).toHaveProperty("profile");
    expect(payload).toHaveProperty("performance_goal", "double weekly job buys");
    expect(payload).toHaveProperty("current_metrics", "12 jobs / wk");
    expect(payload).toHaveProperty("constraints", "no token-price claims");
    // Crucially: the raw identifier is NOT forwarded when a profile resolved.
    expect(payload).not.toHaveProperty("acp_profile_or_offer");

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_performance_audit",
      content: "# audit memo",
      schemaVersion: "v2-consulting-1",
      scoringMethod: "acp-profile-only",
      profileId: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    });
  });

  it("does NOT call the resolver when input is free-text", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# text-only audit");

    const out = await handle({
      acp_profile_or_offer:
        "I sell custom on-chain royalty audits for music agents.",
      performance_goal: "land 5 paid clients in 14 days",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    expect(runConsultingAnalysis).toHaveBeenCalledTimes(1);
    const [, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty("profile");
    expect(payload).toHaveProperty(
      "acp_profile_or_offer",
      "I sell custom on-chain royalty audits for music agents.",
    );

    const envelope = JSON.parse(out);
    expect(envelope.scoringMethod).toBe("text-only");
    expect(envelope.profileId).toBeUndefined();
  });

  it("falls back to text-only when an identifier fails to resolve", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason:
        "v1 agent — limited ACP data. Provide a Virtuals v2 agent UUID or EVM wallet to score this agent.",
      inputType: "url",
    });
    runConsultingAnalysis.mockResolvedValueOnce("# text-only fallback");

    const out = await handle({
      acp_profile_or_offer: "https://app.virtuals.io/virtuals/2960",
      performance_goal: "growth",
    });

    expect(resolveAcpProfile).toHaveBeenCalledTimes(1);
    expect(runConsultingAnalysis).toHaveBeenCalledTimes(1);
    const [, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty("profile");
    expect(payload).toHaveProperty(
      "acp_profile_or_offer",
      "https://app.virtuals.io/virtuals/2960",
    );
    expect(payload).toHaveProperty("acp_resolution_note");
    expect(String(payload.acp_resolution_note)).toMatch(/v1 agent/);

    const envelope = JSON.parse(out);
    expect(envelope.scoringMethod).toBe("text-only");
    expect(envelope.profileId).toBeUndefined();
  });

  it("calls the resolver when input is an EVM wallet", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# memo");

    await handle({
      acp_profile_or_offer: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
      performance_goal: "more jobs",
    });

    expect(resolveAcpProfile).toHaveBeenCalledWith(
      "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    );
  });

  it("calls the resolver when input is a bare UUID", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# memo");

    await handle({
      acp_profile_or_offer: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
      performance_goal: "more jobs",
    });

    expect(resolveAcpProfile).toHaveBeenCalledWith(
      "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    );
  });

  it("omits optional fields when blank", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({
      acp_profile_or_offer: "free-form text",
      performance_goal: "y",
      current_metrics: "   ",
      constraints: "",
    });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("current_metrics");
    expect(call).not.toHaveProperty("constraints");
  });
});
