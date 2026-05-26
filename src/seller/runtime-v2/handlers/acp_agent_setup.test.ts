/**
 * Tests for the acp_agent_setup v2 handler (Category 3: NOT APPLICABLE).
 *
 * This handler is for NEW agents that do not yet exist on ACP — there is no
 * existing on-chain profile to resolve. We assert that the resolver mock is
 * NEVER called regardless of input, and that the deliverable envelope does
 * NOT carry a `scoringMethod` / `acpContext` field (these are for the
 * Category 1/2 handlers).
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

const { handle } = await import("./acp_agent_setup.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  runConsultingAnalysis.mockReset();
  resolveAcpProfile.mockReset();
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
    // Category 3: no resolver fields ever surface.
    expect(envelope.scoringMethod).toBeUndefined();
    expect(envelope.acpContext).toBeUndefined();
    expect(envelope.profileId).toBeUndefined();
  });

  it("NEVER calls the ACP resolver — Category 3 offering", async () => {
    runConsultingAnalysis.mockResolvedValueOnce("# setup");

    await handle({
      business_or_project: "x",
      what_you_sell: "y",
      // even if the buyer pastes a URL into a free-text field, we don't try
      // to resolve it — Category 3 has no on-chain profile to enrich.
      current_links: ["https://app.virtuals.io/acp/agents/abc"],
      owner_context: "https://example.com/founder",
    });

    expect(resolveAcpProfile).not.toHaveBeenCalled();
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
