# Suede x402 and ACP Endpoints

Public endpoint reference for Suede Labs x402 payments and ACP-ready agent commerce workflows.

This repository documents current public endpoints only. Planned, internal, admin, or non-routed endpoints are intentionally excluded.

## Positioning

Suede Labs is focused first on programmable IP, creator ownership, provenance, licensing, and agent-accessible commerce. AI music is a core media use case inside that broader IP layer.

## Public Bases

```text
Primary app: https://app.suedeai.ai
Backend agent service: https://suede-ai-app.onrender.com
```

Minor agent social reference: `https://x.com/suedeagent`

## x402 Discovery

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `https://app.suedeai.ai/.well-known/x402` | x402 resource discovery |
| `GET` | `https://app.suedeai.ai/.well-known/x402.json` | x402 payment requirements and Bazaar metadata |
| `GET` | `https://suede-ai-app.onrender.com/.well-known/x402` | Backend x402 resource discovery |
| `GET` | `https://suede-ai-app.onrender.com/.well-known/x402.json` | Backend x402 payment requirements and Bazaar metadata |

## x402 Paid Endpoints

These endpoints return `402 Payment Required` with x402 payment requirements when called without a valid payment header.

| Method | Endpoint | Price | Network | Asset | Purpose |
|---|---|---:|---|---|---|
| `POST` | `https://app.suedeai.ai/agent/generate` | `0.20 USDC` | Base, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Agent-facing music generation |
| `POST` | `https://app.suedeai.ai/create-music` | `0.20 USDC` | Base, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Public music creation endpoint |
| `POST` | `https://app.suedeai.ai/agent/video` | `1.50 USDC` | Base, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Agent-facing short video generation |
| `GET`  | `https://app.suedeai.ai/v1/rights/{assetHash}` | `0.005 USDC` | Base, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Suede Registry attestation lookup (rights, owner, IP account, on-chain metadata) |
| `POST` | `https://app.suedeai.ai/v1/analyze` | `0.003 USDC` | Base, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Audio analysis (BPM, key, mode, energy, danceability, suggested genre) |
| `POST` | `https://app.suedeai.ai/api/payments/x402/credits` | package-priced | Base | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Agent-facing credit purchase |

Payment recipients shown by live x402 challenges:

```text
Media generation: 0xb5a05466712fd5bcdf2883f43cC6B1799428032d
Credit purchase: 0x0e3557e4f662f9bca497611b60c95330de747a7d
```

## Example x402 Challenge

```bash
curl -i -X POST https://app.suedeai.ai/create-music \
  -H 'content-type: application/json' \
  --data '{"prompt":"cinematic synthwave with live drums","durationSeconds":30,"style":"synthwave"}'
```

Expected unauthenticated response:

```text
HTTP/2 402
PAYMENT-REQUIRED: <base64 x402 payment requirements>
```

## ACP and Agent Commerce

The current submission-ready paid commerce proof is the app-host x402 credit route:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `https://app.suedeai.ai/api/payments/x402/credits` | Buy Suede generation credits with x402 USDC on Base |

The backend `/agents/commerce` route is still advertised in older agent-commerce materials, but it is not the primary proof route for current submissions until the backend webhook environment is confirmed.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `https://suede-ai-app.onrender.com/agents/commerce` | Record an agent commerce intent or offer |

Example:

```bash
curl -X POST https://suede-ai-app.onrender.com/agents/commerce \
  -H 'content-type: application/json' \
  --data '{
    "intent": "credit_purchase",
    "buyer": "agent",
    "seller": "suede",
    "amount": 1,
    "currency": "USD",
    "metadata": {
      "useCase": "programmable-ip-media"
    }
  }'
```

Expected response when the backend commerce environment is configured:

```json
{ "ok": true }
```

## Agent Discovery

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `https://app.suedeai.ai/.well-known/agent-card.json` | Public agent card |
| `GET` | `https://suede-ai-app.onrender.com/.well-known/agent-card.json` | Backend agent card |

Current live agent card advertises:

- Music generation
- Video generation
- x402 discovery

## Production Ecosystem Notes

The broader Suede ecosystem includes independent community launches and experiments. The entries below are the only non-independent, officially live production ecosystem references included in this endpoint document. They are noted for context only and are not required to use the public x402 or ACP-ready endpoints above.

| Name | Chain | Contract / Mint | Context |
|---|---|---|---|
| `Suedette` | Solana | `2PD1MnKURYLCCtds9hfvXpvJc6mjhMC5ruUWdFkZbonk` | Ecosystem token / creator-side experiment. |
| `Producer by Suede Labs: Clawdbot` (`SVID`) | Base | `0x2aed2c4dCB3D61938e36f3481dEFE553fac0ADbd` | Virtuals agent context for lightweight video access and token-holder utility. |
| `JBDAO` | Solana | `2zEQm6mLbbU5uoEoGQk3JUX3XJB7qUSkGmjjVHd4VGb7` | SubDAO-governed Suede creator experiment with artist-yield and experimental pooling configuration. |

Source links:

- Suedette: `https://www.solflare.com/prices/suedette/2PD1MnKURYLCCtds9hfvXpvJc6mjhMC5ruUWdFkZbonk/`
- Producer by Suede Labs: Clawdbot / SVID: `https://thebittimes.com/token-SVID-BASE-0x2aed2c4dCB3D61938e36f3481dEFE553fac0ADbd.html`
- JBDAO: `https://www.solflare.com/prices/jeff-buckley-dao/2zEQm6mLbbU5uoEoGQk3JUX3XJB7qUSkGmjjVHd4VGb7/`

## Notes

- x402 payments use USDC on Base.
- Music is the current primary generation function exposed through the paid endpoints.
- Video generation is also exposed through the paid agent endpoint.
- ACP is currently represented by agent-commerce metadata plus app-host credit purchase flows; verify the backend `/agents/commerce` environment before using it as live proof.
- Ecosystem token and agent notes are intentionally secondary to the verified endpoint reference.
- `https://app.suedeai.xyz` is not the current proof host; it redirected to `https://suedeai.ai` during the May 15 verification pass.

## Public Suede Repositories

| Repository | Purpose |
|---|---|
| [suede-token](https://github.com/Suede-AI/suede-token) | Token, contracts, supply, and ecosystem reference |
| [suede-x402-acp](https://github.com/Suede-AI/suede-x402-acp) | x402 payment and ACP-ready endpoint reference |
| [suede-brand-assets](https://github.com/Suede-AI/suede-brand-assets) | Logos, colors, listing copy, and brand assets |
| [suede-docs](https://github.com/Suede-AI/suede-docs) | Programmable IP, creator ownership, provenance, licensing, and agent commerce docs |

## Founder and Public Profile

Suede Labs AI is led by Jason Colapietro.

- Jason Colapietro GitHub: https://github.com/JasonColapietro
- Jason Colapietro X: https://x.com/johnnysuede

## Verification

Last verified: 2026-05-15.

Verified live responses:

- `GET https://app.suedeai.ai/.well-known/x402` returned `200`
- `GET https://app.suedeai.ai/.well-known/x402.json` returned `200`
- `GET https://app.suedeai.ai/.well-known/agent-card.json` returned `200`
- `GET https://app.suedeai.ai/openapi.json` returned `200`
- `POST https://app.suedeai.ai/agent/generate` returned `402`
- `POST https://app.suedeai.ai/create-music` returned `402`
- `POST https://app.suedeai.ai/agent/video` returned `402`
- `POST https://app.suedeai.ai/api/payments/x402/credits` returned `402`
- `GET https://social.suedeai.ai` returned `200`

---
*Founder mirror: [JasonColapietro/suede-x402-acp](https://github.com/JasonColapietro/suede-x402-acp)*
