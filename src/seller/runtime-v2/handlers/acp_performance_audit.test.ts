/**
 * Tests for the acp_performance_audit v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_performance_audit.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("acp_performance_audit handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_performance_audit")).toBe(handle);
  });

  it("throws when `acp_profile_or_offer` is missing", async () => {
    await expect(handle({ performance_goal: "increase revenue" })).rejects.toThrow(
      /Missing or invalid required field: acp_profile_or_offer/,
    );
  });

  it("throws when `performance_goal` is missing", async () => {
    await expect(
      handle({ acp_profile_or_offer: "https://x.y" }),
    ).rejects.toThrow(/Missing or invalid required field: performance_goal/);
  });

  it("forwards required + optional fields and returns a v2 envelope", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# audit memo");

    const out = await handle({
      acp_profile_or_offer: "https://app.virtuals.io/agents/2960",
      performance_goal: "double weekly job buys",
      current_metrics: "12 jobs / wk, 8 unique wallets",
      constraints: "no claims about token price",
    });

    expect(runConsultingAnalysis).toHaveBeenCalledWith("acp_performance_audit", {
      acp_profile_or_offer: "https://app.virtuals.io/agents/2960",
      performance_goal: "double weekly job buys",
      current_metrics: "12 jobs / wk, 8 unique wallets",
      constraints: "no claims about token price",
    });

    const envelope = JSON.parse(out);
    expect(envelope.type).toBe("markdown");
    expect(envelope.service).toBe("acp_performance_audit");
    expect(envelope.schemaVersion).toBe("v2-consulting-1");
    expect(envelope.content).toBe("# audit memo");
  });

  it("omits optional fields when blank", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({
      acp_profile_or_offer: "x",
      performance_goal: "y",
      current_metrics: "   ",
      constraints: "",
    });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("current_metrics");
    expect(call).not.toHaveProperty("constraints");
  });
});
