/**
 * Tests for the acp_x402_promotion_plan v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_x402_promotion_plan.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
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

  it("returns a v2 envelope and forwards optional audience", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# 14-day plan");

    const out = await handle({
      agent_or_business: "Suede Labs",
      primary_offer: "acp_offer_optimization",
      audience: "Virtuals seller agents",
    });

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
    });
  });

  it("omits audience when not provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({ agent_or_business: "x", primary_offer: "y" });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("audience");
  });
});
