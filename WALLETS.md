# Suede Recipient Wallets

A reconciled view of every recipient wallet across the Suede commerce stack. Each surface uses a deliberately scoped recipient so per-product revenue is attributable on-chain; aggregation happens downstream off-chain inside Suede treasury reporting.

This document is the source of truth for "where does payment for X actually settle." If a wallet address appears on a public x402 challenge that is not listed here, treat the discrepancy as a doc bug and update this file before quoting the address elsewhere.

## Recipient wallets by service

| Service | Address | Env var | Why this address |
|---|---|---|---|
| Suede-AI-App (media generation) | `0xb5a05466712fd5bcdf2883f43cC6B1799428032d` | `X402_SELLER_WALLET_ADDRESS` | Per-call USDC for music and video generation, audio analysis, and Suede Registry lookups. Also surfaced on the live `402` challenge for `/agent/generate`, `/create-music`, `/agent/video`, `/v1/rights/*`, `/v1/analyze`. |
| Suede-AI-App (credit purchase fallback) | `0x0e3557e4f662f9bca497611b60c95330de747a7d` | frontend credits-route fallback | Credit-package purchases via `/api/payments/x402/credits`. Kept separate from per-call revenue so credit prepayment and per-call settlement can be reconciled independently. |
| Strumly | `0xb5a05466712fd5bcdf2883f43cC6B1799428032d` | `STRUMLY_USDC_RECEIVER_ADDRESS` | Per-call USDC for Strumly's five paid endpoints and day-pass purchase. Settles to the same address as Suede-AI-App media generation by design — see "Treasury consolidation" below. |
| Producer by Suede Labs | Derived from `VIRTUALS_V2_SIGNER_PRIVATE_KEY` | `VIRTUALS_V2_SIGNER_PRIVATE_KEY` plus `X402_PAY_TO` for the discovery hub | Virtuals ACP v2 escrow releases settle to the agent wallet derived from the signer key. The discovery hub publishes `X402_PAY_TO` for advertised x402 metadata, kept separately so the on-chain ACP identity and the off-chain x402 advertised address can be rotated independently. |
| Suede Artist Agent | Not yet assigned | n/a | Design phase. Per-artist agent identity is expected to derive from an artist-scoped wallet so the artist's representation surface remains attributable to that artist on-chain. |

## Settlement flow

### Suede-AI-App

- **Rail:** x402 HTTP with EIP-3009 transferWithAuthorization on USDC, Base mainnet (`eip155:8453`).
- **Facilitator:** Coinbase CDP, `https://api.cdp.coinbase.com/platform/v2/x402`.
- **Recipient:** `X402_SELLER_WALLET_ADDRESS`. The frontend credits-route fallback (`0x0e3557e4f662f9bca497611b60c95330de747a7d`) is used only for credit-package purchases via `/api/payments/x402/credits`.
- **Where the money ends up:** USDC lands at the recipient address on Base. From there, treasury sweeps move it into Suede's consolidated holdings off-chain.

### Strumly

- **Rail:** x402 HTTP for per-call endpoints; Stripe Agentic Commerce for the Stripe-rails option.
- **Facilitator:** PayAI, `https://facilitator.payai.network`.
- **Recipient:** `STRUMLY_USDC_RECEIVER_ADDRESS`, currently the same Base address that receives Suede-AI-App media generation revenue. The shared address is intentional — Strumly's media-generation revenue flows into the same Suede treasury bucket as Suede-AI-App's media-generation revenue, so on-chain accounting matches the off-chain product-line groupings.
- **Where the money ends up:** Same as Suede-AI-App media generation: Base USDC at the shared recipient, swept into Suede consolidated treasury downstream.

### Producer by Suede Labs

- **Rail:** Virtuals ACP v2. On-chain USDC escrow on Base, opened when a buyer creates a job and released when the seller (Producer) submits a completed deliverable.
- **Facilitator:** None in the x402 sense. The Virtuals ACP marketplace is itself the settlement layer — escrow is on-chain and settlement is escrow-release, not per-request 402.
- **Recipient:** the Base address derived from `VIRTUALS_V2_SIGNER_PRIVATE_KEY`. The discovery hub additionally publishes `X402_PAY_TO` for any advertised x402 metadata so a probing agent sees a stable address even before it opens an ACP job.
- **Where the money ends up:** USDC at the agent wallet on Base. Producer fee revenue is internally attributed to the Producer product line; treasury sweeps consolidate downstream.

### Suede Artist Agent

- Settlement design is not finalized. The expected shape is per-artist USDC settlement to an artist-scoped wallet, with a Suede platform fee taken at the contract level rather than off-chain. This row exists so the stack is documented top-to-bottom even where the rail is not yet shippable.

## Treasury consolidation

The stack uses several wallets on purpose, not by accident.

Each priced surface routes payment to a recipient scoped to that surface so on-chain history matches the way Suede reports revenue off-chain: media generation in one bucket, credit prepayment in another, ACP execution fees in a third, and per-artist agent revenue (when it ships) in its own per-artist bucket. The shared address between Suede-AI-App media generation and Strumly is the exception that proves the rule: those two surfaces sell the same generation output through different front doors, so their revenue belongs in the same bucket.

Wallet count is a deliberate design choice:

- One recipient per product line keeps on-chain accounting auditable per-product without needing tag conventions or memo fields the facilitator may not propagate.
- Per-product wallets can be rotated independently if one is compromised, without affecting unrelated revenue streams.
- Treasury consolidation happens off-chain via Suede's accounting layer, which sweeps each product-line wallet into consolidated holdings on its own cadence.

Strumly's internal handoff documentation references a host called `app.suedeai.xyz` as the wallet-sharing source. The current Suede platform host is `app.suedeai.ai`; `suedeai.xyz` is a legacy hostname that no longer serves the platform (it redirected to `suedeai.ai` during the May 15 verification pass). The wallet itself (`0xb5a...32d`) is correct — only the host reference is stale. This document is the canonical source; downstream docs should be updated to point at `app.suedeai.ai`.

## Verification

Wallets can be verified by:

1. **Live `402` challenge.** Calling any priced Suede-AI-App endpoint without payment headers returns a `402 Payment Required` with the x402 payment requirements, including the `payTo` field. The address there must match the table above. Example:

   ```bash
   curl -i -X POST https://app.suedeai.ai/create-music \
     -H 'content-type: application/json' \
     --data '{"prompt":"test"}'
   ```

   The decoded `PAYMENT-REQUIRED` header carries `payTo` set to the media-generation address listed above.

2. **Discovery manifest.** Fetching `/.well-known/x402.json` from `app.suedeai.ai`, `strumly.com`, or the Producer discovery hub returns the same `payTo` advertised in the live challenge. If the manifest and the live challenge disagree, the live challenge wins and the manifest is stale.

3. **This document.** Anything that contradicts this file is wrong until this file is updated. The file lives in [Suede-AI/suede-x402-acp](https://github.com/Suede-AI/suede-x402-acp) (canonical) and mirrors to [JasonColapietro/suede-x402-acp](https://github.com/JasonColapietro/suede-x402-acp). When a recipient wallet rotates, this file is updated before the live discovery manifests are touched, so the change is auditable in git history.

On-chain attestation infrastructure (Safe-controlled addresses, ENS records, Coinbase-verified entity) for these wallets is not yet published. Until it is, this document and the live discovery manifests are the source of truth. When attestations are added, links to the on-chain proofs will land in the wallet table above and this section will be revised to reference them.

## Address summary

For quick reference, the canonical addresses currently in use:

```text
Suede-AI-App media generation : 0xb5a05466712fd5bcdf2883f43cC6B1799428032d
Suede-AI-App credits fallback : 0x0e3557e4f662f9bca497611b60c95330de747a7d
Strumly                       : 0xb5a05466712fd5bcdf2883f43cC6B1799428032d
Producer by Suede Labs        : derived from VIRTUALS_V2_SIGNER_PRIVATE_KEY
Suede Artist Agent            : not yet assigned
```

All live addresses are on Base mainnet (`eip155:8453`) and receive USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

## See also

- [DISCOVERY.md](./DISCOVERY.md) for the manifest formats that advertise these wallets.
- [README.md](./README.md) for the priced endpoint reference and verification log.
