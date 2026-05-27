# Suede Discovery Manifests

A reference for every machine-readable manifest exposed by the Suede commerce stack. Different agent ecosystems read different formats; Suede publishes the union so a buyer agent does not need to know which protocol Suede speaks before it can hire Suede.

This document is the single index. Each section is short on purpose — go to the live URL for the authoritative payload, this file tells you which payload to ask for.

## What this is

The Suede commerce stack is intentionally multi-format. An x402-aware agent should be able to discover Suede by hitting `/.well-known/x402.json`. A Virtuals ACP marketplace buyer should be able to read offerings from a Virtuals ACP profile. A Stripe Agentic Commerce client should find a manifest at `/.well-known/agentic-commerce.json`. The same surface, described in the format the caller already understands.

Three principles drive the format set:

1. **No exclusion.** Suede does not bet on one discovery protocol winning. Every well-known format an agent ecosystem currently uses is served.
2. **Source-of-truth pricing.** Prices are written into the manifest, not just documentation. Agents that quote prices from a manifest cannot drift from the live `402` challenge response.
3. **Server-side secrets.** Provider-specific keys and base URLs are never in a public manifest. The manifests describe *what* Suede sells and *how* to pay for it; *how* Suede fulfills is not advertised.

## By format

### x402 v1 — `/.well-known/x402.json`

Canonical x402 discovery document. Lists priced resources, USDC asset on Base, recipient wallet (`payTo`), and per-resource payment requirements compatible with the EIP-3009 challenge that the same host returns on a `402 Payment Required` response.

- Served by: Suede-AI-App, Strumly, Producer by Suede Labs.
- Primary consumer: x402-aware agents and clients using the x402 client library.
- Stability: stable. This is the discovery doc the live `402` challenges resolve to.

### x402scan v1 — `/.well-known/x402`

The format consumed by the x402scan crawler. Same logical content as the v1 manifest, packaged for the crawler's index. Served alongside the v1 manifest so the crawler indexes correctly without breaking direct readers of `x402.json`.

- Served by: Suede-AI-App, Strumly.
- Primary consumer: x402scan and downstream catalogs that ingest its index.
- Stability: stable.

### Agentic Commerce (Stripe) — `/.well-known/agentic-commerce.json`

Manifest format defined by the Stripe Agentic Commerce protocol. Describes purchasable offerings and the Stripe-mediated payment surface used when a buyer chooses Stripe rails instead of x402 USDC.

- Served by: Suede-AI-App, Strumly.
- Primary consumer: Stripe Agentic Commerce buyer agents and the Stripe-side directory.
- Stability: stable for production use; format spec is itself young, so new fields land here first when Stripe publishes them.

### Virtuals ACP profile — `/.well-known/virtuals-acp.json`

Declarative Virtuals ACP profile listing the offerings Suede ships through the Virtuals marketplace and the SLAs it commits to. Lets a Virtuals-side reader resolve Suede's ACP identity without traversing the marketplace API.

- Served by: Suede-AI-App.
- Primary consumer: Virtuals ACP marketplace integrations and aggregators that index ACP profiles outside the live marketplace.
- Stability: experimental. The format is Suede-defined; the marketplace itself remains the authoritative ACP catalog.

### The402 (legacy) — `/.well-known/the402.json`

Legacy HTTP-402 catalog format used by the402 directory. Served by the Producer agent's discovery hub so the402 indexers can list it.

- Served by: Producer by Suede Labs (`discovery/.well-known/the402.json` in this repo).
- Primary consumer: the402 directory and crawlers built against the402's shape.
- Stability: legacy. Preserved for indexer compatibility; new clients should prefer the x402 v1 manifest.

### A2A agent card — `/.well-known/agent-card.json`

Google A2A agent-card format. Describes the agent identity, supported interfaces (HTTP+JSON and ACP), security schemes, and skills with input/output modes. Suede-AI-App and Producer both serve a card; the Producer card is the canonical one for the Producer agent itself (committed at `discovery/.well-known/agent-card.json`).

- Served by: Suede-AI-App, Producer by Suede Labs.
- Primary consumer: A2A-aware agents, A2A directory crawlers, Google's agent-card catalog.
- Stability: stable.

### llms.txt — `/llms.txt`

Plain-text LLM-readable summary of the agent and its offerings. Designed to be quoted directly into an LLM prompt without parsing. Mirrors the manifest content in prose so a model that cannot follow JSON pointers can still describe what Suede sells and how much it costs.

- Served by: Suede-AI-App, Strumly, Producer by Suede Labs.
- Primary consumer: LLM-driven discovery agents, llms.txt-aware crawlers.
- Stability: stable.

### OpenAPI 3.1 — `/openapi.json`

OpenAPI 3.1 specification of the priced HTTP surface. Suede-AI-App and Strumly extend each priced path with `x-payment-info`, encoding the per-route price and asset directly in the path definition. The Producer agent extends each ACP job operation with `x-acp-offering`, encoding the offering name, USDC fee, and SLA.

- Served by: Suede-AI-App, Strumly, Producer by Suede Labs.
- Primary consumer: any OpenAPI-aware tool — code generators, API explorers, agent frameworks that already parse OpenAPI.
- Stability: stable. The vendor extensions (`x-payment-info`, `x-acp-offering`) are Suede-defined but follow the OpenAPI extension convention.

### MCP server — `/mcp` and `discovery/mcp-server.json`

Model Context Protocol server. Strumly exposes a live MCP endpoint that responds to JSON-RPC `POST /mcp` and a card on `GET /mcp`. Producer publishes a static `mcp-server.json` describing the MCP registration shape so it can be listed in MCP catalogs even though the live MCP server is not the Producer agent's primary surface.

- Served by: Strumly (live JSON-RPC), Producer by Suede Labs (registry metadata only).
- Primary consumer: MCP-aware coding agents and MCP registries.
- Stability: stable.

## By service

### Suede-AI-App — `app.suedeai.ai`

The Suede platform host. Exposes 17 priced HTTP routes plus the credit-purchase endpoint. Discovery surface:

- `/.well-known/x402.json` — x402 v1
- `/.well-known/x402` — x402scan v1
- `/.well-known/agentic-commerce.json` — Stripe Agentic Commerce
- `/.well-known/virtuals-acp.json` — Virtuals ACP profile
- `/.well-known/agent-card.json` — A2A agent card
- `/openapi.json` — OpenAPI 3.1 with `x-payment-info`
- `/llms.txt` — LLM-readable summary

Pricing: 17 priced routes, $0.003 (audio analysis) → $1.50 (video generation). Prices are env-overrideable at the platform layer; the live manifests reflect whatever is currently configured.

### Strumly — `strumly.com`

x402 + Stripe ACP discovery for the Strumly product. Discovery surface:

- `/.well-known/x402.json` — x402 v1
- `/.well-known/x402` — x402scan v1
- `/.well-known/agentic-commerce.json` — Stripe Agentic Commerce
- `/openapi.json` — OpenAPI 3.1 with `x-payment-info`
- `/mcp` — MCP server (live JSON-RPC + agent card on GET)
- `/llms.txt` — LLM-readable summary

Pricing: 5 paid endpoints + $9.99 day pass + free 5/day/IP tier. Strumly uses PayAI as facilitator (`facilitator.payai.network`).

### Producer by Suede Labs — this repo

Producer is Suede's dedicated Virtuals ACP execution agent. Discovery surface (in-repo templates, served by the Render-hosted `johnny-suede-x402-discovery` web service):

- `discovery/.well-known/x402.json` — x402 v1 (priced video offerings)
- `discovery/.well-known/the402.json` — the402 legacy catalog
- `discovery/.well-known/agent-card.json` — A2A agent card
- `discovery/.well-known/agent.yml` — legacy ACP manifest
- `discovery/openapi.json` — OpenAPI 3.1 with `x-acp-offering`
- `discovery/mcp-server.json` — MCP registry metadata
- `llms.txt` — LLM-readable summary

Pricing: 28 ACP offerings, $0.01 → $49, fixed USDC fee per job. The pricing carries a roughly 2.5×–3× markup over the equivalent Suede-AI-App x402 endpoint; the spread covers the Virtuals marketplace tax and the agent's execution margin.

Payment rail: Virtuals ACP v2 on-chain escrow (USDC on Base). Funds settle on job completion via the on-chain escrow rather than per-call HTTP 402.

### Suede Artist Agent

Per-artist hosted agent built in an individual artist's likeness, sold to artists, managers, and labels. The discovery surface and payment rail are still being defined; this row is included so the stack is documented top-to-bottom even where a layer is not yet shippable.

- Repo: documented inside `Suede-AI-App` at `docs/products/SUEDE_ARTIST_AGENT.md`.
- Status: design phase. No live manifests yet.

## By consumer use case

If you are building an agent or integration, fetch the manifest that matches your protocol:

| If you are building... | Fetch | From |
|---|---|---|
| An x402-aware agent | `/.well-known/x402.json` | Suede-AI-App, Strumly, Producer |
| An x402scan crawler integration | `/.well-known/x402` | Suede-AI-App, Strumly |
| A Stripe Agentic Commerce buyer | `/.well-known/agentic-commerce.json` | Suede-AI-App, Strumly |
| A Virtuals ACP marketplace integration | `/.well-known/virtuals-acp.json` plus the on-chain ACP profile | Suede-AI-App, the live ACP marketplace |
| An A2A-aware client | `/.well-known/agent-card.json` | Suede-AI-App, Producer |
| An OpenAPI-driven code generator | `/openapi.json` | Suede-AI-App, Strumly, Producer |
| An MCP-driven coding agent | `/mcp` (live) or `mcp-server.json` (registry) | Strumly (live), Producer (registry) |
| An LLM-driven discovery loop | `/llms.txt` | Suede-AI-App, Strumly, Producer |
| A the402 directory indexer | `/.well-known/the402.json` | Producer |

If you are unsure which protocol your agent speaks, the answer is almost always `/.well-known/x402.json` — it is the most widely indexed and the live `402` challenges resolve to the same payload.

## Versioning and stability

| Format | Status | Notes |
|---|---|---|
| x402 v1 | Stable | The live `402` challenges are the authoritative source; the manifest reflects them. |
| x402scan v1 | Stable | Reads cleanly with the v1 manifest; new fields land in v1 first. |
| Agentic Commerce | Stable for production, evolving | The Stripe spec is itself young; new manifest fields appear here first when Stripe publishes them. |
| Virtuals ACP profile | Experimental | Suede-defined shape. The Virtuals marketplace remains the authoritative ACP catalog. |
| The402 | Legacy | Preserved for indexer compatibility. New clients should prefer x402 v1. |
| A2A agent card | Stable | Matches the Google A2A schema. |
| llms.txt | Stable | Prose mirror of the manifest content. |
| OpenAPI 3.1 | Stable | Vendor extensions (`x-payment-info`, `x-acp-offering`) are Suede-defined but follow OpenAPI conventions. |
| MCP | Stable | Strumly's live MCP endpoint follows the MCP 2025-10-01 schema. |

## Format shape reference

Short shape examples for the three formats an integrator is most likely to consume first. These are illustrative — the live manifest at the URL is always the authoritative source.

### x402 v1 (`/.well-known/x402.json`)

```jsonc
{
  "x402Version": 2,
  "type": "http",
  "resources": [
    {
      "resource": "/create-music",
      "method": "POST",
      "price": "$0.20",
      "asset": {
        "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "chain": "eip155:8453",
        "symbol": "USDC"
      },
      "payTo": "0xb5a05466712fd5bcdf2883f43cC6B1799428032d"
    }
  ]
}
```

### OpenAPI with `x-payment-info` (Suede-AI-App, Strumly)

```jsonc
{
  "paths": {
    "/create-music": {
      "post": {
        "x-payment-info": {
          "price": "0.20",
          "currency": "USDC",
          "network": "base",
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "payTo": "0xb5a05466712fd5bcdf2883f43cC6B1799428032d"
        }
      }
    }
  }
}
```

### OpenAPI with `x-acp-offering` (Producer by Suede Labs)

```jsonc
{
  "paths": {
    "/jobs/general_video": {
      "post": {
        "x-acp-offering": {
          "name": "general_video",
          "fee_usdc": 8,
          "sla_minutes": 25
        }
      }
    }
  }
}
```

The `x-acp-offering` extension carries the ACP fee and SLA rather than an x402 `payTo`, because settlement for Producer happens through Virtuals ACP escrow rather than per-request HTTP 402.

## Maintaining this index

Add a new manifest when:

- A new format becomes broadly indexed by an agent ecosystem and Suede chooses to be listed in it.
- An existing format ships a major version that is not backward-compatible with the previous one.

Remove a manifest when:

- The format is fully deprecated by its upstream and no working indexer reads it anymore.
- A surface stops serving the manifest in production.

Do not remove a manifest just because a newer format exists — Suede deliberately overlaps formats during transition periods so older clients are not stranded.

## See also

- [WALLETS.md](./WALLETS.md) for recipient wallet attribution and settlement flow per service.
- [DISCOVERABILITY.md](./DISCOVERABILITY.md) for the Producer agent's discoverability strategy (keywords, marketplace listings, indexer priorities).
- [README.md](./README.md) for the public endpoint reference, prices, and verification log.
