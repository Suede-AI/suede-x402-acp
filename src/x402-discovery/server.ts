import { createHash } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "fs";
import { extname, resolve } from "path";

type JsonRecord = Record<string, unknown>;

const PORT = Number(process.env.PORT || 4020);
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const JOHNNY_AGENT = process.env.JOHNNY_SUEDE_AGENT_NAME || "johnny-suede";
const PRODUCER_AGENT =
  process.env.PRODUCER_AGENT_NAME || "producer-by-suede-labs";
const X402_PAY_TO = process.env.X402_PAY_TO?.trim() || "";
const X402_NETWORK = process.env.X402_NETWORK || "eip155:8453";
const X402_USDC_ASSET =
  process.env.X402_USDC_ASSET || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ||
  "https://api.cdp.coinbase.com/platform/v2/x402";

const ROOT = resolve(process.cwd());
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
};

// Origins allowed to read payment-resource routes (/x402/*) cross-origin from
// a browser context. Non-browser agent calls (server-to-server, no Origin
// header) are unaffected — CORS only governs browser-resident scripts.
//
// Default is empty: browsers cannot scrape live `payTo` / `amountMicros` from
// 402 responses. Add known agent-framework web origins here when needed.
const ALLOWED_X402_ORIGINS = new Set<string>([]);

function isPaymentResource(pathname: string): boolean {
  return pathname.startsWith("/x402/");
}

function resolveCorsOrigin(
  pathname: string,
  originHeader: string | undefined
): string | null {
  // Manifest/discovery routes stay open to wildcard so indexers can read them.
  if (!isPaymentResource(pathname)) {
    return "*";
  }
  // Payment-resource routes: allowlist-only for browser cross-origin reads.
  // Requests without an Origin header (typical server-to-server agents) get
  // no CORS header at all — they don't need one.
  if (!originHeader) {
    return null;
  }
  return ALLOWED_X402_ORIGINS.has(originHeader) ? originHeader : null;
}

const offerings = [
  {
    id: "general_video",
    route: "/x402/general-video",
    method: "POST",
    title: "General AI Video",
    priceUsd: 8,
    amountMicros: "8000000",
    duration: 10,
    description:
      "Generate a 10-second AI video from a prompt with optional references, aspect ratio, mode, and sound.",
    schemaRef: "#/components/schemas/GeneralVideoRequest",
  },
  {
    id: "product_showcase_video",
    route: "/x402/product-showcase-video",
    method: "POST",
    title: "5-Second Product Showcase Video",
    priceUsd: 6,
    amountMicros: "6000000",
    duration: 5,
    description:
      "Create a polished 5-second product showcase video from one product image URL.",
    schemaRef: "#/components/schemas/ProductShowcaseRequest",
  },
  {
    id: "product_showcase_video_10s",
    route: "/x402/product-showcase-video-10s",
    method: "POST",
    title: "10-Second Premium Product Showcase Video",
    priceUsd: 10,
    amountMicros: "10000000",
    duration: 10,
    description:
      "Create a premium 10-second product showcase video from one product image URL.",
    schemaRef: "#/components/schemas/ProductShowcaseRequest",
  },
  {
    id: "meme_video",
    route: "/x402/meme-video",
    method: "POST",
    title: "Meme Video",
    priceUsd: 6,
    amountMicros: "6000000",
    duration: 8,
    description:
      "Generate an 8-second vertical meme or viral short-form video from a prompt and optional reference image.",
    schemaRef: "#/components/schemas/MemeVideoRequest",
  },
] as const;

function absolute(path: string): string {
  return new URL(path, PUBLIC_BASE_URL).toString();
}

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function etag(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
}

interface RequestContext {
  pathname: string;
  origin: string | undefined;
}

function buildHeaders(
  ctx: RequestContext,
  contentType: string,
  body: string,
  extraHeaders: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
    ETag: etag(body),
    ...extraHeaders,
  };
  const corsOrigin = resolveCorsOrigin(ctx.pathname, ctx.origin);
  if (corsOrigin !== null) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    if (corsOrigin !== "*") {
      // Required so caches/proxies don't serve the wrong origin to other callers.
      headers["Vary"] = "Origin";
    }
  }
  return headers;
}

function send(
  res: ServerResponse,
  ctx: RequestContext,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(status, buildHeaders(ctx, contentType, body, extraHeaders));
  res.end(body);
}

function sendJson(
  res: ServerResponse,
  ctx: RequestContext,
  status: number,
  body: JsonRecord,
  extraHeaders: Record<string, string> = {}
): void {
  send(
    res,
    ctx,
    status,
    JSON.stringify(body, null, 2),
    "application/json; charset=utf-8",
    extraHeaders
  );
}

function notFound(res: ServerResponse, ctx: RequestContext): void {
  sendJson(res, ctx, 404, { error: "not_found" });
}

function loadDiscoveryFile(path: string): {
  body: string;
  contentType: string;
} {
  const body = readFileSync(resolve(ROOT, path), "utf8");
  const contentType = MIME_TYPES[extname(path)] || "text/plain; charset=utf-8";
  return { body, contentType };
}

function agentCard(): JsonRecord {
  const card = readJson("discovery/.well-known/agent-card.json");
  return {
    ...card,
    name: JOHNNY_AGENT,
    description:
      "Johnny Suede is the priority Suede Labs agent. The producer-by-suede-labs execution agent creates paid AI video generation jobs through ACP and x402-style discovery.",
    url: PUBLIC_BASE_URL,
    supportedInterfaces: [
      {
        url: absolute("/"),
        protocolBinding: "HTTP+JSON",
        protocolVersion: "1.0",
      },
      {
        url: `acp://${PRODUCER_AGENT}`,
        protocolBinding: "ACP",
        protocolVersion: "virtuals-acp",
      },
    ],
    metadata: {
      priorityAgents: [
        { priority: 1, name: JOHNNY_AGENT, displayName: "Johnny Suede" },
        {
          priority: 2,
          name: PRODUCER_AGENT,
          displayName: "Suede Labs Producer Agent",
        },
      ],
      x402: absolute("/.well-known/x402.json"),
      the402: absolute("/.well-known/the402.json"),
      openapi: absolute("/openapi.json"),
      llms: absolute("/llms.txt"),
      apiKeys: {
        required: ["VIDEO_API_KEY"],
        visibility: "server-side-only",
        note: "Provider-specific generation details are intentionally not published.",
      },
    },
  };
}

function x402Manifest(): JsonRecord {
  return {
    ...readJson("discovery/.well-known/x402.json"),
    baseUrl: PUBLIC_BASE_URL,
    facilitator: X402_FACILITATOR_URL,
    payTo: X402_PAY_TO || null,
    paymentConfigured: Boolean(X402_PAY_TO),
    network: X402_NETWORK,
    asset: X402_USDC_ASSET,
    apiKeys: {
      required: ["VIDEO_API_KEY"],
      visibility: "server-side-only",
      note: "Provider-specific generation details are intentionally not published.",
    },
    resources: offerings.map((offering) => ({
      resource: absolute(offering.route),
      method: offering.method,
      toolName: offering.id,
      price: `$${offering.priceUsd.toFixed(2)}`,
      mimeType: "application/json",
      description: offering.description,
    })),
  };
}

function the402Manifest(): JsonRecord {
  return {
    ...readJson("discovery/.well-known/the402.json"),
    baseUrl: PUBLIC_BASE_URL,
    apiKeys: {
      required: ["VIDEO_API_KEY"],
      visibility: "server-side-only",
      note: "Provider-specific generation details are intentionally not published.",
    },
    catalog: offerings.map((offering) => ({
      id: offering.id,
      name: offering.title,
      priceUsd: offering.priceUsd,
      endpoint: absolute(offering.route),
    })),
  };
}

function openapi(): JsonRecord {
  const spec = readJson("discovery/openapi.json");
  return {
    ...spec,
    servers: [
      { url: PUBLIC_BASE_URL, description: "Johnny Suede x402 discovery hub" },
      {
        url: `acp://${PRODUCER_AGENT}`,
        description: "Virtuals ACP marketplace agent",
      },
    ],
    info: {
      ...(spec.info as JsonRecord),
      title: "Johnny Suede Agent Network",
      description:
        "Johnny Suede is priority agent 1. Producer-by-suede-labs is priority agent 2 and executes paid AI video production jobs.",
    },
  };
}

function paymentRequiredFor(pathname: string): JsonRecord {
  const offering = offerings.find((item) => item.route === pathname);
  if (!offering) {
    return { error: "unknown_x402_resource" };
  }

  const paymentRequirements = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: X402_NETWORK,
        asset: X402_USDC_ASSET,
        amount: offering.amountMicros,
        payTo: X402_PAY_TO,
        maxTimeoutSeconds: 300,
      },
    ],
    resource: absolute(offering.route),
    description: offering.description,
    mimeType: "application/json",
    metadata: {
      service: "Johnny Suede Agent Network",
      priorityAgents: [
        { priority: 1, name: JOHNNY_AGENT },
        { priority: 2, name: PRODUCER_AGENT },
      ],
      toolName: offering.id,
      title: offering.title,
      inputSchema: offering.schemaRef,
      openapi: absolute("/openapi.json"),
      llms: absolute("/llms.txt"),
      agentCard: absolute("/.well-known/agent-card.json"),
      x402: absolute("/.well-known/x402.json"),
      generationProvider: {
        apiKeyEnv: "VIDEO_API_KEY",
        visibility: "server-side-only",
      },
    },
  };

  return {
    error: "payment_required",
    message:
      "This is the hosted x402 discovery surface. Create the paid job through ACP or configure live facilitator settlement for direct x402 fulfillment.",
    facilitator: X402_FACILITATOR_URL,
    paymentRequirements,
  };
}

function paymentConfigMissing(pathname: string): JsonRecord {
  const offering = offerings.find((item) => item.route === pathname);
  return {
    error: "payment_configuration_missing",
    message:
      "X402_PAY_TO must be configured before this endpoint can publish payable x402 requirements.",
    resource: absolute(pathname),
    toolName: offering?.id,
    priorityAgents: [
      { priority: 1, name: JOHNNY_AGENT },
      { priority: 2, name: PRODUCER_AGENT },
    ],
  };
}

function home(): string {
  const rows = offerings
    .map(
      (offering) =>
        `<li><a href="${offering.route}">${offering.title}</a> - $${offering.priceUsd.toFixed(
          2
        )} - ${offering.description}</li>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Johnny Suede Agent Network</title>
  <meta name="description" content="Johnny Suede is the priority Suede Labs agent. Producer-by-suede-labs is second priority for paid AI video generation through ACP and x402 discovery.">
</head>
<body>
  <main>
    <h1>Johnny Suede Agent Network</h1>
    <p><strong>Priority 1:</strong> Johnny Suede. <strong>Priority 2:</strong> producer-by-suede-labs.</p>
    <p>Paid AI video generation for agents: product showcase videos, meme clips, short-form ads, launch creative, music visuals, and branded media.</p>
    <h2>Discover</h2>
    <ul>
      <li><a href="/llms.txt">llms.txt</a></li>
      <li><a href="/openapi.json">OpenAPI</a></li>
      <li><a href="/.well-known/agent-card.json">A2A Agent Card</a></li>
      <li><a href="/.well-known/agent.yml">Legacy ACP Manifest</a></li>
      <li><a href="/.well-known/x402.json">x402 Manifest</a></li>
      <li><a href="/.well-known/the402.json">the402 Manifest</a></li>
      <li><a href="/discovery">Unified Discovery JSON</a></li>
    </ul>
    <h2>x402 Resources</h2>
    <ul>${rows}</ul>
  </main>
</body>
</html>`;
}

function unifiedDiscovery(): JsonRecord {
  return {
    name: JOHNNY_AGENT,
    displayName: "Johnny Suede",
    description:
      "Priority Suede Labs agent for paid AI video generation. Producer-by-suede-labs is second priority and executes jobs.",
    priorityAgents: [
      { priority: 1, name: JOHNNY_AGENT, displayName: "Johnny Suede" },
      {
        priority: 2,
        name: PRODUCER_AGENT,
        displayName: "Suede Labs Producer Agent",
      },
    ],
    routes: {
      home: absolute("/"),
      llms: absolute("/llms.txt"),
      openapi: absolute("/openapi.json"),
      agentCard: absolute("/.well-known/agent-card.json"),
      legacyAcp: absolute("/.well-known/agent.yml"),
      x402: absolute("/.well-known/x402.json"),
      the402: absolute("/.well-known/the402.json"),
    },
    listings: {
      cdpBazaar:
        "Set X402_PAY_TO, enable facilitator settlement, complete one successful settlement, then verify in CDP Bazaar.",
      agenticMarket:
        "Agentic.Market indexes x402/Bazaar-compatible resources; verify after CDP Bazaar indexing.",
      the402:
        "Publish /.well-known/the402.json and submit/list the public base URL.",
      agent402:
        "Use OpenAPI, llms.txt, and x402 resource routes for marketplace ingestion.",
      mcpRegistry: "Use discovery/mcp-server.json as registry metadata.",
    },
    apiKeys: {
      required: ["VIDEO_API_KEY"],
      visibility: "server-side-only",
      note:
        "Provider-specific generation details are intentionally not published. ACP and x402 variables are marketplace/payment plumbing, not generation-provider keys.",
    },
    offerings,
  };
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || "/", PUBLIC_BASE_URL);
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const ctx: RequestContext = { pathname: url.pathname, origin };

  if (req.method === "OPTIONS") {
    send(res, ctx, 204, "");
    return;
  }

  if (url.pathname === "/") {
    send(res, ctx, 200, home(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/llms.txt") {
    const file = loadDiscoveryFile("llms.txt");
    send(res, ctx, 200, file.body, file.contentType);
    return;
  }

  if (url.pathname === "/openapi.json") {
    sendJson(res, ctx, 200, openapi());
    return;
  }

  if (url.pathname === "/discovery") {
    sendJson(res, ctx, 200, unifiedDiscovery());
    return;
  }

  if (url.pathname === "/.well-known/agent-card.json") {
    sendJson(res, ctx, 200, agentCard());
    return;
  }

  if (url.pathname === "/.well-known/agent.yml") {
    const file = loadDiscoveryFile("discovery/.well-known/agent.yml");
    send(res, ctx, 200, file.body, file.contentType);
    return;
  }

  if (url.pathname === "/.well-known/x402.json") {
    sendJson(res, ctx, 200, x402Manifest());
    return;
  }

  if (url.pathname === "/.well-known/the402.json") {
    sendJson(res, ctx, 200, the402Manifest());
    return;
  }

  if (offerings.some((item) => item.route === url.pathname)) {
    if (!X402_PAY_TO) {
      sendJson(res, ctx, 503, paymentConfigMissing(url.pathname), {
        "Retry-After": "300",
      });
      return;
    }
    const body = paymentRequiredFor(url.pathname);
    const paymentRequired = (body as { paymentRequirements: JsonRecord })
      .paymentRequirements;
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
      "base64"
    );
    sendJson(res, ctx, 402, body, { "PAYMENT-REQUIRED": encoded });
    return;
  }

  notFound(res, ctx);
}

createServer(handle).listen(PORT, () => {
  console.log(`Johnny Suede x402 discovery hub listening on ${PORT}`);
});
