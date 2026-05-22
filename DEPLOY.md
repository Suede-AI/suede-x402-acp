# Deploy

This repo deploys two independent services to Render via `render.yaml`:

1. **`johnny-suede-x402-discovery`** (web) — public discovery hub serving `/llms.txt`, OpenAPI, `/.well-known/*`, and x402 `402` responses.
2. **`virtuals-acp-agent`** (worker) — the ACP seller runtime. Connects to `acpx.virtuals.io` over Socket.IO and serves video-generation jobs.

The CLI's built-in `acp serve deploy railway` flow is **not** used here — that path is Railway-only. For Render, deploy via `render.yaml` (Blueprints) or the `render` CLI.

## Prerequisites

Before the first deploy you must have:

| Item | Where to get it |
| --- | --- |
| **Render account** with a paid plan that allows workers (free tier doesn't run workers) | https://render.com |
| **`render` CLI** installed and authenticated | `brew install render` then `render login` |
| **`LITE_AGENT_API_KEY`** — Virtuals ACP seller identity key | Run `npm run acp -- setup` locally first, then read it from the generated `config.json`, OR create the agent via the Virtuals dashboard |
| **`VIDEO_API_KEY`**, **`VIDEO_API_BASE_URL`**, **`VIDEO_MODEL`**, **`VIDEO_UPLOAD_BASE_URL`** — server-side video provider credentials | Your video provider account; intentionally not documented here so the provider stays private |
| **`X402_PAY_TO`** — Base-chain receiving wallet for x402 USDC settlement | Use the agent wallet from `acp wallet address`, or any wallet you control on Base |

You do **not** need to commit any of these. They're injected at the Render layer (`sync: false` in `render.yaml`).

## First Deploy

```bash
# 1. Verify offerings are registered on ACP first (this requires LITE_AGENT_API_KEY locally)
npm install
npm run acp -- agent switch producer-by-suede-labs   # or whichever agent owns these offerings
npm run acp -- sell create general_video
npm run acp -- sell create product_showcase_video
npm run acp -- sell create product_showcase_video_10s
npm run acp -- sell create meme_video

# 2. Push the blueprint to Render. From the repo root:
render blueprint launch
# Render reads render.yaml and creates both services.

# 3. Inject secrets for each service (see env var table below).
# Either set them in the Render dashboard or via CLI:
render env set --service johnny-suede-x402-discovery X402_PAY_TO=0xYourBaseWallet
render env set --service virtuals-acp-agent LITE_AGENT_API_KEY=...
render env set --service virtuals-acp-agent VIDEO_API_KEY=...
render env set --service virtuals-acp-agent VIDEO_API_BASE_URL=...
render env set --service virtuals-acp-agent VIDEO_MODEL=...
render env set --service virtuals-acp-agent VIDEO_UPLOAD_BASE_URL=...

# 4. Trigger a deploy for each service after secrets are set.
render deploys create --service johnny-suede-x402-discovery
render deploys create --service virtuals-acp-agent
```

## Required Secrets

Both services need `sync: false` env vars filled in before they will work:

### `johnny-suede-x402-discovery` (web)

| Var | Required? | Notes |
| --- | --- | --- |
| `X402_PAY_TO` | Yes | Base-chain wallet address (0x...) that receives USDC from x402 settlements. If missing, the `/x402/*` endpoints return 503 instead of 402. |

All other env vars in this service are baked into `render.yaml` defaults.

### `virtuals-acp-agent` (worker)

| Var | Required? | Notes |
| --- | --- | --- |
| `LITE_AGENT_API_KEY` | Yes | Virtuals ACP seller identity. Without this the worker exits immediately. |
| `VIDEO_API_KEY` | Yes | Bearer token for the upstream video provider. Without this every job fails at execution. |
| `VIDEO_API_BASE_URL` | Yes | Provider API base URL (e.g. `https://api.<provider>.com`). |
| `VIDEO_MODEL` | Yes | Model identifier the provider expects. |
| `VIDEO_UPLOAD_BASE_URL` | Yes | Provider file-upload base URL (used by `uploadFileByUrl` to host reference images). |

See `.env.example` for the local-development equivalents.

## Verifying a Live Deploy

```bash
# Discovery hub
curl https://johnny-suede-x402-discovery.onrender.com/.well-known/x402.json | jq .paymentConfigured
# Expect: true (means X402_PAY_TO is set)

curl -i -X POST https://johnny-suede-x402-discovery.onrender.com/x402/meme-video
# Expect: HTTP/2 402 with PAYMENT-REQUIRED header

# Worker: tail logs and confirm socket connection
render logs --service virtuals-acp-agent --tail
# Expect lines: "[seller] Agent: producer-by-suede-labs (dir: producer-by-suede-labs)"
#               "[seller] Available offerings: general_video, ..."
#               "[seller] Seller runtime is running. Waiting for jobs..."
```

## Redeploys

When you change offerings or handlers, redeploy the worker only:

```bash
git push origin codex/suede-agent-discoverability
render deploys create --service virtuals-acp-agent
```

If you only change `render.yaml` defaults (not secrets), Render will pick them up on the next blueprint sync. Secret changes (`sync: false`) require an explicit `env set` + `deploys create`.

## Tearing Down

```bash
render services delete johnny-suede-x402-discovery
render services delete virtuals-acp-agent
```

This does not delete the ACP offerings on the Virtuals registry. Use `acp sell delete <offering>` for that.
