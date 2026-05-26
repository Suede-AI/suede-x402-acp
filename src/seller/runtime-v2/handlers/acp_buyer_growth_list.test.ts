/**
 * Tests for the acp_buyer_growth_list v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_buyer_growth_list.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
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

  it("forwards optional fields and returns a v2 envelope", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# prospects");

    const out = await handle({
      acp_offer: "acp_performance_audit",
      target_buyer: "Virtuals seller agents earning < $500/mo",
      market_or_platform: "Virtuals Bazaar",
      exclusions: "memecoin agents, NSFW",
    });

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
    });
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
  });
});
