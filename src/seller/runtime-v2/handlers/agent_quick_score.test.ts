/**
 * Tests for the agent_quick_score v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runConsultingAnalysis = vi.fn();

vi.mock("../clients/consulting-client.js", () => ({
  runConsultingAnalysis,
  assertReady: vi.fn(),
  listConsultingServices: vi.fn(() => []),
}));

// Import after mock so the handler picks up the mocked client.
const { handle } = await import("./agent_quick_score.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent_quick_score handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("agent_quick_score")).toBe(handle);
  });

  it("throws when `target` is missing", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: target/,
    );
  });

  it("throws when `target` is blank", async () => {
    await expect(handle({ target: "   " })).rejects.toThrow(
      /Missing or invalid required field: target/,
    );
  });

  it("throws when `target` is not a string", async () => {
    await expect(handle({ target: 42 } as Record<string, unknown>)).rejects.toThrow(
      /Missing or invalid required field: target/,
    );
  });

  it("calls the consulting client and returns a v2 envelope", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# scorecard body");

    const out = await handle({ target: " https://x.y " });

    expect(runConsultingAnalysis).toHaveBeenCalledWith("agent_quick_score", {
      target: "https://x.y",
    });

    const envelope = JSON.parse(out);
    expect(envelope).toEqual({
      type: "markdown",
      service: "agent_quick_score",
      content: "# scorecard body",
      schemaVersion: "v2-consulting-1",
    });
  });
});
