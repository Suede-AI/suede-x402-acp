/**
 * Tests for the acp_market_arbitrage_report v2 handler (Category 2: ENRICH).
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

const { handle } = await import("./acp_market_arbitrage_report.js");
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

describe("acp_market_arbitrage_report handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_market_arbitrage_report")).toBe(handle);
  });

  it("throws when `agent_or_business` is missing", async () => {
    await expect(handle({ what_you_sell: "audits" })).rejects.toThrow(
      /Missing or invalid required field: agent_or_business/,
    );
  });

  it("throws when `what_you_sell` is missing", async () => {
    await expect(handle({ agent_or_business: "Suede" })).rejects.toThrow(
      /Missing or invalid required field: what_you_sell/,
    );
  });

  it("forwards exclude_categories when supplied; acpContext=not_provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# arbitrage map");

    const out = await handle({
      agent_or_business: "Suede Labs",
      what_you_sell: "ACP consulting deliverables",
      exclude_categories: "music generation, video generation",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    expect(runConsultingAnalysis).toHaveBeenCalledWith(
      "acp_market_arbitrage_report",
      {
        agent_or_business: "Suede Labs",
        what_you_sell: "ACP consulting deliverables",
        exclude_categories: "music generation, video generation",
      },
    );

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_market_arbitrage_report",
      content: "# arbitrage map",
      schemaVersion: "v2-consulting-1",
      acpContext: "not_provided",
    });
  });

  it("resolves agent_url_for_context and forwards profile; acpContext=resolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce(PROFILE_FIXTURE);
    runConsultingAnalysis.mockResolvedValueOnce("# arbitrage");

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
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolved");
  });

  it("marks acpContext=resolution_failed when resolver returns unresolved", async () => {
    resolveAcpProfile.mockResolvedValueOnce({
      resolved: false,
      reason: "not found",
      inputType: "uuid",
    });
    runConsultingAnalysis.mockResolvedValueOnce("# arbitrage");

    const out = await handle({
      agent_or_business: "x",
      what_you_sell: "y",
      agent_url_for_context: "https://example.com/agent",
    });

    expect(resolveAcpProfile).toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("does NOT call resolver when context is plain free-text", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# arbitrage");

    const out = await handle({
      agent_or_business: "x",
      what_you_sell: "y",
      agent_url_for_context: "no URL here",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
    const envelope = JSON.parse(out);
    expect(envelope.acpContext).toBe("resolution_failed");
  });

  it("omits exclude_categories when missing", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({ agent_or_business: "x", what_you_sell: "y" });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("exclude_categories");
    expect(call).not.toHaveProperty("profile");
  });
});
