/**
 * Tests for the acp_agent_setup v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

const { handle } = await import("./acp_agent_setup.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("acp_agent_setup handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("acp_agent_setup")).toBe(handle);
  });

  it("throws when `business_or_project` is missing", async () => {
    await expect(handle({ what_you_sell: "music" })).rejects.toThrow(
      /Missing or invalid required field: business_or_project/,
    );
  });

  it("throws when `what_you_sell` is missing", async () => {
    await expect(handle({ business_or_project: "Suede" })).rejects.toThrow(
      /Missing or invalid required field: what_you_sell/,
    );
  });

  it("forwards current_links + owner_context and returns a v2 envelope", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# setup guide");

    const out = await handle({
      business_or_project: "Suede Music",
      what_you_sell: "AI-generated tracks for indie artists",
      current_links: [" https://suede.ai ", "https://twitter.com/suede", ""],
      owner_context: " solo founder, no team ",
    });

    expect(runConsultingAnalysis).toHaveBeenCalledWith("acp_agent_setup", {
      business_or_project: "Suede Music",
      what_you_sell: "AI-generated tracks for indie artists",
      current_links: ["https://suede.ai", "https://twitter.com/suede"],
      owner_context: "solo founder, no team",
    });

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "acp_agent_setup",
      content: "# setup guide",
      schemaVersion: "v2-consulting-1",
    });
  });

  it("omits empty optional fields", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("body");

    await handle({
      business_or_project: "x",
      what_you_sell: "y",
      current_links: [],
      owner_context: "  ",
    });

    const call = runConsultingAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("current_links");
    expect(call).not.toHaveProperty("owner_context");
  });
});
