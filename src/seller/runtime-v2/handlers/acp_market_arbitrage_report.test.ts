/**
 * Tests for the acp_market_arbitrage_report v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_market_arbitrage_report.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
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

  it("forwards exclude_categories when supplied", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# arbitrage map");

    const out = await handle({
      agent_or_business: "Suede Labs",
      what_you_sell: "ACP consulting deliverables",
      exclude_categories: "music generation, video generation",
    });

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
    });
  });

  it("omits exclude_categories when missing", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({ agent_or_business: "x", what_you_sell: "y" });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("exclude_categories");
  });
});
