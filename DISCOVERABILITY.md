# Johnny Suede Agent Network Discoverability

This repo should make Johnny Suede the first thing humans and agents see. `producer-by-suede-labs` is the second priority agent and the execution surface for video jobs.

## Priority Order

1. `johnny-suede` / Johnny Suede: primary agent, routing priority, brand identity, and discovery anchor.
2. `producer-by-suede-labs`: secondary agent, ACP seller runtime, and AI video production worker.

## Front-and-Center Surfaces

- `README.md`: first section is now Johnny Suede first, producer second, not generic ACP CLI docs.
- `llms.txt`: concise agent-readable entry point for crawlers and coding agents.
- `src/seller/offerings/producer-by-suede-labs/*/offering.json`: ACP marketplace descriptions and schemas are the highest-impact live discovery surface.
- `discovery/openapi.json`: HTTP-style description of the four purchasable capabilities.
- `discovery/.well-known/agent-card.json`: A2A-style agent card template for `/.well-known/agent-card.json`.
- `discovery/.well-known/agent.yml`: legacy ACP-style manifest template for `/.well-known/agent.yml`.
- `discovery/.well-known/x402.json`: x402-style well-known manifest.
- `discovery/.well-known/the402.json`: the402-style catalog manifest.
- `discovery/mcp-server.json`: MCP registry metadata.
- `src/x402-discovery/server.ts`: hosted discovery hub for Render or any Node host.

## ACP Marketplace Keywords

Use these phrases consistently in profile descriptions, offering descriptions, posts, and docs:

- Johnny Suede
- Johnny Suede agent
- Johnny Suede AI video
- Suede Labs AI video producer
- ACP video generation agent
- x402 paid video generation
- AI video generation
- AI product showcase video
- product ad creative
- ecommerce product video
- short-form social video
- TikTok Reels Shorts video
- meme video agent
- AI music video visuals
- launch video creative
- autonomous media production

## Registration Steps

After confirming the active ACP agent is `producer-by-suede-labs`, register the updated offerings:

```bash
acp sell create general_video
acp sell create product_showcase_video
acp sell create product_showcase_video_10s
acp sell create meme_video
```

Then update the agent profile so the marketplace listing itself carries the same search signals:

```bash
acp profile update description "Johnny Suede is the priority Suede Labs agent. The producer-by-suede-labs execution agent creates AI videos for other agents: product showcase videos, short-form ads, meme clips, launch creative, music visuals, and branded social content through ACP/x402-style paid agent commerce."
```

## API Key Policy

Keep the video-generation provider private in public discovery surfaces.

- `VIDEO_API_KEY`: required server-side video generation secret.
- `LITE_AGENT_API_KEY`: separate Virtuals ACP seller identity key, not a generation provider key.
- `X402_PAY_TO`: receiving wallet for x402 discovery/payment metadata, not a generation provider key.

Do not publish provider-specific names, base URLs, model IDs, or provider secret names in public `llms.txt`, OpenAPI, A2A, x402, the402, or marketplace metadata unless it is required for an operator-only deployment guide.

## x402 / Bazaar / Marketplace Notes

The hosted discovery service publishes x402-style 402 responses and manifests. For full CDP Bazaar indexing, a production endpoint still needs live facilitator settlement. Make the public endpoint discoverable by:

- returning HTTP 402 with complete x402 payment requirements on unauthenticated paid endpoints
- using the CDP facilitator for Bazaar indexing
- adding Bazaar extension metadata with strong descriptions, JSON Schemas, examples, MIME types, and tags
- completing at least one successful paid settlement
- verifying via CDP discovery search and merchant endpoints

Priority listing targets:

- CDP x402 Bazaar
- Agentic.Market
- the402
- Agent402
- MCP Registry
- A2A-compatible agent crawlers
- OpenAPI crawlers
- `llms.txt` crawlers
- x402.org or facilitator-specific discovery catalogs

## Deployment Notes

When this agent is hosted behind a web domain, publish:

- `https://<domain>/llms.txt`
- `https://<domain>/.well-known/agent-card.json`
- `https://<domain>/.well-known/agent.yml`
- `https://<domain>/.well-known/x402.json`
- `https://<domain>/.well-known/the402.json`
- `https://<domain>/openapi.json`
- `https://<domain>/discovery`

Keep these files synchronized with the ACP offering JSON files before every registration or redeploy.
