/**
 * Tests for the acp_x402_promotion_plan v2 handler (Category 2: ENRICH).
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

const { handle } = await import("./acp_x402_promotion_plan.js");
const { getHandler } = await import("../dispatch.js");

const PROFILE_FIXTURE = {
  resolved: true as const,
  agent: {
    id: "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    name: "Producer",
    walletEvm: "0xabc",
    walletSol: null,
    consoleEnabled: false,
    createdAt: "2026-05-18T05:31:18.728Z",
    lastActiveAt: null,
    isHidden: false,
    builderCode: null,
  },
  offerings: [],
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

describe("acp_x402_promotion_plan handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_x402_promotion_plan")).toBe(handle);
  });

  it("throws when `agent_or_business` is missing", async () => {
    await expect(handle({ primary_offer: "audit" })).rejects.toThrow(
      /Missing or invalid required field: agent_or_business/,
    );
  });

  it("throws when `primary_offer` is missing", async () => {
    await expect(handle({ agent_or_business: "Suede" })).rejects.toThrow(
      /Missing or invalid required field: primary_offer/,
    );
  });

  it("returns a v2 envelope and forwards optional audience; acpContext=not_provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# 14-day plan");

    const out = await handle({
      agent_or_business: "Suede Labs",
      primary_offer: "acp_offer_optimization",
      audience: "Virtuals seller agents",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    expect(runConsultingAnalysis).toHaveBeenCalledWith(
      "acp_x402_promotion_plan",
      {
        agent_or_business: "Suede Labs",
        primary_offer: "acp_offer_optimization",
        audience: "Virtuals seller agents",
      },
    );

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_x402_promotion_plan",
      content: "# 14-day plan",
      schemaVersion: "v2-consulting-1",
      acpContext: "not_provided",
    });
  });

  it("resolves agent_url_for_context and forwards profile; acpContext=resolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# plan");

    const out = await handle({
      agent_or_business: "Suede",
      primary_offer: "audit",
      agent_url_for_context:
        "https://app.virtuals.io/acp/agents/019e3991-374d-75f3-a6b8-17ff309b4cd2",
    });

    expect(resolveAcpProfile).toHaveBeenCalledTimes(1);
    const [, payload] = runConsultingAnalysis.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toHaveProperty("profile");
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolved");
  });

  it("marks acpContext=resolution_failed when resolver returns unresolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason: "not found",
      inputType: "wallet",
    });
    runConsultingAnalysis.mockResolvedValueOnce("# plan");

    const out = await handle({
      agent_or_business: "x",
      primary_offer: "y",
      agent_url_for_context: "0x0000000000000000000000000000000000000000",
    });

    expect(resolveAcpProfile).toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("does NOT call resolver when context is plain free-text", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# plan");

    const out = await handle({
      agent_or_business: "x",
      primary_offer: "y",
      agent_url_for_context: "this is not a URL",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("omits audience when not provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({ agent_or_business: "x", primary_offer: "y" });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("audience");
    expect(call).not.toHaveProperty("profile");
  });
});
