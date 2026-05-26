/**
 * Tests for the acp_buyer_growth_list v2 handler (Category 2: ENRICH).
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

const { handle } = await import("./acp_buyer_growth_list.js");
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

describe("acp_buyer_growth_list handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_buyer_growth_list")).toBe(handle);
  });

  it("throws when `acp_offer` is missing", async () => {
    await expect(handle({ target_buyer: "founders" })).rejects.toThrow(
      /Missing or invalid required field: acp_offer/,
    );
  });

  it("throws when `target_buyer` is missing", async () => {
    await expect(handle({ acp_offer: "audit" })).rejects.toThrow(
      /Missing or invalid required field: target_buyer/,
    );
  });

  it("forwards optional fields and returns a v2 envelope; acpContext=not_provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# prospects");

    const out = await handle({
      acp_offer: "acp_performance_audit",
      target_buyer: "Virtuals seller agents earning < $500/mo",
      market_or_platform: "Virtuals Bazaar",
      exclusions: "memecoin agents, NSFW",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    expect(runConsultingAnalysis).toHaveBeenCalledWith(
      "acp_buyer_growth_list",
      {
        acp_offer: "acp_performance_audit",
        target_buyer: "Virtuals seller agents earning < $500/mo",
        market_or_platform: "Virtuals Bazaar",
        exclusions: "memecoin agents, NSFW",
      },
    );

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_buyer_growth_list",
      content: "# prospects",
      schemaVersion: "v2-consulting-1",
      acpContext: "not_provided",
    });
  });

  it("resolves agent_url_for_context and forwards profile; acpContext=resolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# prospects");

    const out = await handle({
      acp_offer: "audit",
      target_buyer: "agents",
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
      inputType: "uuid",
    });
    runConsultingAnalysis.mockResolvedValueOnce("# prospects");

    const out = await handle({
      acp_offer: "x",
      target_buyer: "y",
      agent_url_for_context: "https://example.com",
    });

    expect(resolveAcpProfile).toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("does NOT call resolver when context is plain free-text", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# prospects");

    const out = await handle({
      acp_offer: "x",
      target_buyer: "y",
      agent_url_for_context: "anonymous agent",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("omits empty optional fields", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({
      acp_offer: "x",
      target_buyer: "y",
      market_or_platform: "",
      exclusions: "   ",
    });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("market_or_platform");
    expect(call).not.toHaveProperty("exclusions");
    expect(call).not.toHaveProperty("profile");
  });
});
