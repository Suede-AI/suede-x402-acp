/**
 * Tests for the acp_offer_optimization v2 handler (Category 2: ENRICH).
 *
 * Asserts:
 *   - required-field validation still throws
 *   - resolver is called when the optional `agent_url_for_context` is a URL
 *   - resolver is NOT called when the optional field is missing or free-text
 *   - resolved profile is forwarded to LLM as `profile`
 *   - envelope's `acpContext` reflects resolved / not_provided / resolution_failed
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

const { handle } = await import("./acp_offer_optimization.js");
const { getHandler } = await import("../dispatch.js");

const PROFILE_FIXTURE = {
  resolved: true as const,
  agent: {
    id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    name: "Producer",
    walletEvm: "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
    walletSol: null,
    consoleEnabled: false,
    createdAt: "2026-05-18T05:31:18.728Z",
    lastActiveAt: null,
    isHidden: false,
    builderCode: null,
  },
  offerings: [
    {
      name: "agent_quick_score",
      priceUsd: 3,
      slaMinutes: 5,
      requirementSchema: {},
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

describe("acp_offer_optimization handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_offer_optimization")).toBe(handle);
  });

  it("throws when `agent_or_business` is missing", async () => {
    await expect(handle({ what_you_sell: "anything" })).rejects.toThrow(
      /Missing or invalid required field: agent_or_business/,
    );
  });

  it("throws when `what_you_sell` is missing", async () => {
    await expect(handle({ agent_or_business: "Acme Agent" })).rejects.toThrow(
      /Missing or invalid required field: what_you_sell/,
    );
  });

  it("forwards optional array + buyer when provided; acpContext=not_provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# offerings");

    const out = await handle({
      agent_or_business: "Suede Labs",
      what_you_sell: "AI consulting for ACP sellers",
      current_offerings: [" audit ", "promotion plan", ""],
      target_buyer_agent: " Butler ",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    expect(runConsultingAnalysis).toHaveBeenCalledWith(
      "acp_offer_optimization",
      {
        agent_or_business: "Suede Labs",
        what_you_sell: "AI consulting for ACP sellers",
        current_offerings: ["audit", "promotion plan"],
        target_buyer_agent: "Butler",
      },
    );

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_offer_optimization",
      content: "# offerings",
      schemaVersion: "v2-consulting-1",
      acpContext: "not_provided",
    });
  });

  it("resolves agent_url_for_context and forwards profile; acpContext=resolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# offerings");

    const out = await handle({
      agent_or_business: "Suede",
      what_you_sell: "consulting",
      agent_url_for_context:
        "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    });

    expect(resolveAcpProfile).toHaveBeenCalledTimes(1);
    const [, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toHaveProperty("profile");
    const profile = payload.profile as Record<string, unknown>;
    expect(profile).toHaveProperty("offerings");

    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolved");
  });

  it("marks acpContext=resolution_failed when resolver returns unresolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason: "not found",
      inputType: "uuid",
    });
    runConsultingAnalysis.mockResolvedValueOnce("# offerings");

    const out = await handle({
      agent_or_business: "x",
      what_you_sell: "y",
      agent_url_for_context: "0x0000000000000000000000000000000000000000",
    });

    expect(resolveAcpProfile).toHaveBeenCalled();
    const [, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty("profile");

    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("marks acpContext=resolution_failed when context is plain free-text", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# offerings");

    const out = await handle({
      agent_or_business: "x",
      what_you_sell: "y",
      agent_url_for_context: "just a description, not a URL",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("omits empty optional fields", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({
      agent_or_business: "x",
      what_you_sell: "y",
      current_offerings: [],
      target_buyer_agent: "   ",
    });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("current_offerings");
    expect(call).not.toHaveProperty("target_buyer_agent");
    expect(call).not.toHaveProperty("profile");
  });
});
