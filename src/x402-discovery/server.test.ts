// =============================================================================
// Tests for the hosted x402 discovery web service (src/x402-discovery/server.ts).
//
// The module exports handle(req, res) and only binds a port when
// NODE_ENV !== "test" (Vitest sets NODE_ENV=test, so importing is safe).
//
// CRITICAL: env is read at MODULE LOAD (const X402_PAY_TO = ..., PUBLIC_BASE_URL,
// etc.). To exercise configured vs unconfigured states we stub env BEFORE the
// module evaluates, then vi.resetModules() + a fresh dynamic import per scenario.
//
// Discovery JSON is read with readFileSync(resolve(process.cwd(), "discovery/..")).
// Tests run with cwd = repo root, so the real discovery/*.json resolve fine and
// fs is NOT mocked.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

const PAY_TO = "0xabcdef0000000000000000000000000000000001";
const BASE_URL = "https://discovery.example.test";

type CapturedResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type HandleFn = (req: IncomingMessage, res: ServerResponse) => void;

// Builds a minimal mock req/res, drives handle() (sync: it calls res.end()
// synchronously for these routes), and returns the captured response.
function call(
  handle: HandleFn,
  options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
  }
): CapturedResponse {
  const captured: CapturedResponse = { status: 0, headers: {}, body: "" };

  const req = {
    method: options.method,
    url: options.url,
    headers: options.headers ?? {},
  } as unknown as IncomingMessage;

  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      captured.headers = headers ?? {};
      return this;
    },
    end(body?: string) {
      captured.body = body ?? "";
      return this;
    },
  } as unknown as ServerResponse;

  handle(req, res);
  return captured;
}

// Fresh module load with a controlled env. Caller stubs env first.
async function loadServer(): Promise<{ handle: HandleFn }> {
  vi.resetModules();
  const mod = await import("./server.js");
  return { handle: mod.handle as HandleFn };
}

describe("x402-discovery server / payment NOT configured (X402_PAY_TO unset)", () => {
  let handle: HandleFn;

  beforeEach(async () => {
    // Explicitly unset so an ambient env var cannot leak a configured payTo.
    vi.stubEnv("X402_PAY_TO", "");
    vi.stubEnv("PUBLIC_BASE_URL", BASE_URL);
    ({ handle } = await loadServer());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns 503 with Retry-After and a non-leaking payment_configuration_missing body", () => {
    // Act
    const res = call(handle, { method: "POST", url: "/x402/general-video" });
    const body = JSON.parse(res.body);

    // Assert: status + retry guidance
    expect(res.status).toBe(503);
    expect(res.headers["Retry-After"]).toBe("300");
    expect(body.error).toBe("payment_configuration_missing");

    // Assert: must NOT leak a payTo address in any form
    expect("payTo" in body).toBe(false);
    expect("paymentRequirements" in body).toBe(false);
    expect(res.body).not.toContain(PAY_TO);
    expect(res.body).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it("does not emit a 402 PAYMENT-REQUIRED header when unconfigured", () => {
    // Act
    const res = call(handle, { method: "POST", url: "/x402/general-video" });

    // Assert
    expect(res.headers["PAYMENT-REQUIRED"]).toBeUndefined();
  });
});

describe("x402-discovery server / payment configured (X402_PAY_TO set)", () => {
  let handle: HandleFn;

  beforeEach(async () => {
    vi.stubEnv("X402_PAY_TO", PAY_TO);
    vi.stubEnv("PUBLIC_BASE_URL", BASE_URL);
    ({ handle } = await loadServer());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns 402 with the configured payTo and the general-video amount", () => {
    // Act
    const res = call(handle, { method: "POST", url: "/x402/general-video" });
    const body = JSON.parse(res.body);
    const accept = body.paymentRequirements.accepts[0];

    // Assert
    expect(res.status).toBe(402);
    expect(accept.amount).toBe("8000000");
    expect(accept.payTo).toBe(PAY_TO);
  });

  it("emits a base64 PAYMENT-REQUIRED header that decodes to x402Version 2", () => {
    // Act
    const res = call(handle, { method: "POST", url: "/x402/general-video" });
    const header = res.headers["PAYMENT-REQUIRED"];

    // Assert: header present and decodes to a JSON object with x402Version 2
    expect(header).toBeDefined();
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    expect(typeof decoded).toBe("object");
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].payTo).toBe(PAY_TO);
  });

  it.each([
    ["/x402/general-video", "8000000"],
    ["/x402/product-showcase-video", "6000000"],
    ["/x402/product-showcase-video-10s", "10000000"],
    ["/x402/meme-video", "6000000"],
  ])("quotes the correct micro-USDC amount for %s", (route, amount) => {
    // Act
    const res = call(handle, { method: "POST", url: route });
    const body = JSON.parse(res.body);

    // Assert
    expect(res.status).toBe(402);
    expect(body.paymentRequirements.accepts[0].amount).toBe(amount);
  });

  it("returns 404 not_found for an unknown x402 route", () => {
    // Act
    const res = call(handle, { method: "POST", url: "/x402/does-not-exist" });
    const body = JSON.parse(res.body);

    // Assert
    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  it("returns 204 with an empty body for OPTIONS preflight on a payment route", () => {
    // Act
    const res = call(handle, { method: "OPTIONS", url: "/x402/general-video" });

    // Assert
    expect(res.status).toBe(204);
    expect(res.body).toBe("");
  });

  describe("CORS policy", () => {
    it("omits Access-Control-Allow-Origin on a payment route for a non-allowlisted Origin", () => {
      // Act
      const res = call(handle, {
        method: "GET",
        url: "/x402/general-video",
        headers: { origin: "https://evil.example" },
      });

      // Assert: payment routes are allowlist-only; evil origin gets no CORS grant
      expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("returns a wildcard Access-Control-Allow-Origin on /openapi.json for any Origin", () => {
      // Act
      const res = call(handle, {
        method: "GET",
        url: "/openapi.json",
        headers: { origin: "https://evil.example" },
      });

      // Assert: discovery/manifest routes stay open to indexers
      expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    });
  });

  it("sets an ETag header on a JSON discovery response", () => {
    // Act
    const res = call(handle, {
      method: "GET",
      url: "/.well-known/x402.json",
    });

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.ETag).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it("publishes exactly 4 resources in /.well-known/x402.json, all rooted at PUBLIC_BASE_URL", () => {
    // Act
    const res = call(handle, {
      method: "GET",
      url: "/.well-known/x402.json",
    });
    const body = JSON.parse(res.body);

    // Assert
    expect(res.status).toBe(200);
    expect(body.resources).toHaveLength(4);
    for (const resource of body.resources) {
      expect(typeof resource.resource).toBe("string");
      expect(resource.resource.startsWith(BASE_URL)).toBe(true);
    }
  });
});
