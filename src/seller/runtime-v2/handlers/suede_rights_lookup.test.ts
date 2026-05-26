/**
 * Tests for the suede_rights_lookup v2 handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupRights = vi.fn();
class SuedeEndpointUnavailableError extends Error {
  constructor(endpoint: string) {
    super(`Suede backend endpoint ${endpoint} not yet deployed`);
    this.name = "SuedeEndpointUnavailableError";
  }
}
class SuedeInternalRouteMissingError extends Error {
  constructor(endpoint: string) {
    super(`Suede ${endpoint} is live as x402 but has no internal counterpart`);
    this.name = "SuedeInternalRouteMissingError";
  }
}

vi.mock("../clients/music-client-v2.js", () => ({
  lookupRights,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
}));

const { handle } = await import("./suede_rights_lookup.js");
const { getHandler } = await import("../dispatch.js");

beforeEach(() => {
  lookupRights.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suede_rights_lookup handler", () => {
  it("registers itself with the dispatch registry", () => {
    expect(getHandler("suede_rights_lookup")).toBe(handle);
  });

  it("rejects missing asset_hash", async () => {
    await expect(handle({})).rejects.toThrow(
      /Missing or invalid required field: asset_hash/
    );
  });

  it("forwards assetHash + includeLicense and returns rights envelope", async () => {
    lookupRights.mockResolvedValueOnce({
      registered: true,
      registrant: "0xabc",
      onChain: { tx: "0xdeadbeef" },
    });

    const out = await handle({
      asset_hash: "0x3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
      include_license: true,
    });

    expect(lookupRights).toHaveBeenCalledWith({
      assetHash: "0x3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
      includeLicense: true,
    });

    const env = JSON.parse(out);
    expect(env.type).toBe("json");
    expect(env.service).toBe("suede_rights_lookup");
    expect(env.rights).toEqual({
      registered: true,
      registrant: "0xabc",
      onChain: { tx: "0xdeadbeef" },
    });
  });

  it("maps BACKEND_UNAVAILABLE on SuedeInternalRouteMissingError", async () => {
    lookupRights.mockRejectedValueOnce(
      new SuedeInternalRouteMissingError("GET /v1/rights/{assetHash}")
    );
    try {
      await handle({
        asset_hash: "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
      });
      throw new Error("did not throw");
    } catch (err: any) {
      expect(err.code).toBe("BACKEND_UNAVAILABLE");
    }
  });
});
