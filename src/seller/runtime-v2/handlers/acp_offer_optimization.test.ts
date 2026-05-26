/**
 * Tests for the acp_offer_optimization v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_offer_optimization.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
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

  it("forwards optional array + buyer when provided", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# offerings");

    const out = await handle({
      agent_or_business: "Suede Labs",
      what_you_sell: "AI consulting for ACP sellers",
      current_offerings: [" audit ", "promotion plan", ""],
      target_buyer_agent: " Butler ",
    });

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
    });
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
  });
});
