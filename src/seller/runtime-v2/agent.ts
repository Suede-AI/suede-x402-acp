// =============================================================================
// v2 AcpAgent factory.
//
// Reads VIRTUALS_V2_* env vars + config.json's agentsV2[0] (for non-secret
// fields), wires up PrivyAlchemyEvmProviderAdapter, and returns a started
// AcpAgent. Instantiation is deferred to createV2Agent() so importing this
// module from v1 paths (e.g. tsx bin/acp.ts) does not crash on missing env.
// =============================================================================

import {
  AcpAgent,
  PrivyAlchemyEvmProviderAdapter,
} from "@virtuals-protocol/acp-node-v2";
import type { Address } from "viem";
import { getActiveAgentV2 } from "../../lib/config.js";

interface ResolvedConfig {
  walletAddress: Address;
  walletId: string;
  signerPrivateKey: string;
  builderCode: string;
  privyAppId?: string;
}

function resolveConfig(): ResolvedConfig {
  const v2 = getActiveAgentV2();

  const walletAddress = (
    process.env.VIRTUALS_V2_WALLET_EVM?.trim() || v2?.walletEvm
  ) as Address | undefined;
  const walletId =
    process.env.VIRTUALS_V2_PRIVY_WALLET_ID?.trim() || v2?.privyWalletId || undefined;
  // Private key MUST come from env — never from config.json. The config file
  // is checked into source control on some setups; secrets belong in .env or
  // a runtime secret manager only.
  const signerPrivateKey =
    process.env.VIRTUALS_V2_SIGNER_PRIVATE_KEY?.trim() || undefined;
  const builderCode =
    process.env.VIRTUALS_V2_BUILDER_CODE?.trim() || v2?.builderCode || undefined;
  const privyAppId =
    process.env.VIRTUALS_V2_PRIVY_APP_ID?.trim() || v2?.privyAppId || undefined;

  const missing: string[] = [];
  if (!walletAddress) missing.push("VIRTUALS_V2_WALLET_EVM");
  if (!walletId) missing.push("VIRTUALS_V2_PRIVY_WALLET_ID");
  if (!signerPrivateKey) missing.push("VIRTUALS_V2_SIGNER_PRIVATE_KEY");
  if (!builderCode) missing.push("VIRTUALS_V2_BUILDER_CODE");

  if (missing.length > 0) {
    throw new Error(
      `[v2-seller] Missing required env var(s): ${missing.join(", ")}. ` +
        `Set them in .env. config.json's agentsV2[0] supplies non-secret ` +
        `fallbacks for walletEvm/privyWalletId/builderCode/privyAppId only — ` +
        `VIRTUALS_V2_SIGNER_PRIVATE_KEY is required from env and is NOT read ` +
        `from config.json under any circumstance.`
    );
  }

  return {
    walletAddress: walletAddress as Address,
    walletId: walletId as string,
    signerPrivateKey: signerPrivateKey as string,
    builderCode: builderCode as string,
    privyAppId: privyAppId as string | undefined,
  };
}

/**
 * Create and configure a v2 AcpAgent. Caller is responsible for `await
 * agent.start(...)` and `await agent.stop()`.
 */
export async function createV2Agent(): Promise<AcpAgent> {
  const cfg = resolveConfig();

  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: cfg.walletAddress,
    walletId: cfg.walletId,
    signerPrivateKey: cfg.signerPrivateKey,
    builderCode: cfg.builderCode,
    privyAppId: cfg.privyAppId,
  });

  return AcpAgent.create({ provider });
}
