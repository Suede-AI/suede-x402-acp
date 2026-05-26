#!/usr/bin/env npx tsx
// =============================================================================
// Seller runtime — main entrypoint.
//
// Usage:
//   npx tsx src/seller/runtime/seller.ts
//   (or)  acp serve start
// =============================================================================

import { connectAcpSocket } from "./acpSocket.js";
import {
  acceptOrRejectJob,
  requestPayment,
  deliverJob,
  deliverJobFailure,
} from "./sellerApi.js";
import { loadOffering, listOfferings } from "./offerings.js";
import { AcpJobPhase, type AcpJobEventData } from "./types.js";
import type { ExecuteJobResult } from "./offeringTypes.js";
import { assertOfferingReady } from "./clientReadiness.js";
import { getMyAgentInfo } from "../../lib/wallet.js";
import {
  checkForExistingProcess,
  writePidToConfig,
  removePidFromConfig,
  sanitizeAgentName,
} from "../../lib/config.js";

function setupCleanupHandlers(): void {
  const cleanup = () => {
    removePidFromConfig();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    console.error("[seller] Uncaught exception:", err);
    cleanup();
    process.exit(1);
  });
  process.on("unhandledRejection", (reason, promise) => {
    console.error(
      "[seller] Unhandled rejection at:",
      promise,
      "reason:",
      reason
    );
    cleanup();
    process.exit(1);
  });
}

// -- Config --

const ACP_URL = process.env.ACP_SOCKET_URL || "https://acpx.virtuals.io";
let agentDirName: string = "";

// -- Job handling --

function resolveOfferingName(data: AcpJobEventData): string | undefined {
  try {
    const negotiationMemo = data.memos.find(
      (m) => m.nextPhase === AcpJobPhase.NEGOTIATION
    );
    if (negotiationMemo) {
      return JSON.parse(negotiationMemo.content).name;
    }
  } catch {
    return undefined;
  }
}

function resolveServiceRequirements(
  data: AcpJobEventData
): Record<string, any> {
  const negotiationMemo = data.memos.find(
    (m) => m.nextPhase === AcpJobPhase.NEGOTIATION
  );
  if (negotiationMemo) {
    try {
      return JSON.parse(negotiationMemo.content).requirement;
    } catch {
      return {};
    }
  }
  return {};
}

async function handleNewTask(data: AcpJobEventData): Promise<void> {
  const jobId = data.id;

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `[seller] New task  jobId=${jobId}  phase=${AcpJobPhase[data.phase] ?? data.phase
    }`
  );
  console.log(`         client=${data.clientAddress}  price=${data.price}`);
  console.log(`         context=${JSON.stringify(data.context)}`);
  console.log(`${"=".repeat(60)}`);

  // Step 1: Accept / reject
  if (data.phase === AcpJobPhase.REQUEST) {
    if (!data.memoToSign) {
      return;
    }

    const negotiationMemo = data.memos.find(
      (m) => m.id == Number(data.memoToSign)
    );

    if (negotiationMemo?.nextPhase !== AcpJobPhase.NEGOTIATION) {
      return;
    }

    const offeringName = resolveOfferingName(data);
    const requirements = resolveServiceRequirements(data);

    if (!offeringName) {
      await acceptOrRejectJob(jobId, {
        accept: false,
        reason: "Invalid offering name",
      });
      return;
    }

    // Refuse jobs for offerings whose required env vars are unset — this
    // prevents the seller from collecting payment for an offering that
    // will then throw at executeJob time.
    const readiness = assertOfferingReady(offeringName);
    if (!readiness.ready) {
      console.warn(
        `[seller] Rejecting job ${jobId} for "${offeringName}" — not ready: ${readiness.reason}`
      );
      await acceptOrRejectJob(jobId, {
        accept: false,
        reason: `Offering temporarily unavailable: ${readiness.reason}`,
      });
      return;
    }

    try {
      const { config, handlers } = await loadOffering(offeringName, agentDirName);

      if (handlers.validateRequirements) {
        const validationResult = handlers.validateRequirements(requirements);

        let isValid: boolean;
        let reason: string | undefined;

        if (typeof validationResult === "boolean") {
          isValid = validationResult;
          reason = isValid ? undefined : "Validation failed";
        } else {
          isValid = validationResult.valid;
          reason = validationResult.reason;
        }

        if (!isValid) {
          const rejectionReason = reason || "Validation failed";
          console.log(
            `[seller] Validation failed for offering "${offeringName}" — rejecting: ${rejectionReason}`
          );
          await acceptOrRejectJob(jobId, {
            accept: false,
            reason: rejectionReason,
          });
          return;
        }
      }

      await acceptOrRejectJob(jobId, {
        accept: true,
        reason: "Job accepted",
      });

      const funds =
        config.requiredFunds && handlers.requestAdditionalFunds
          ? handlers.requestAdditionalFunds(requirements)
          : undefined;

      const paymentReason = handlers.requestPayment
        ? handlers.requestPayment(requirements)
        : funds?.content ?? "Request accepted";

      await requestPayment(jobId, {
        content: paymentReason,
        payableDetail: funds
          ? {
            amount: funds.amount,
            tokenAddress: funds.tokenAddress,
            recipient: funds.recipient,
          }
          : undefined,
      });
    } catch (err) {
      console.error(`[seller] Error processing job ${jobId}:`, err);
    }
  }

  // Handle TRANSACTION (deliver)
  if (data.phase === AcpJobPhase.TRANSACTION) {
    const offeringName = resolveOfferingName(data);
    const requirements = resolveServiceRequirements(data);

    if (offeringName) {
      try {
        const { handlers } = await loadOffering(offeringName, agentDirName);
        console.log(
          `[seller] Executing offering "${offeringName}" for job ${jobId} (TRANSACTION phase)...`
        );
        const result: ExecuteJobResult = await handlers.executeJob(
          requirements
        );

        await deliverJob(jobId, {
          deliverable: result.deliverable,
          payableDetail: result.payableDetail,
        });
        console.log(`[seller] Job ${jobId} — delivered.`);
      } catch (err) {
        // The buyer has already paid by the time we reach TRANSACTION.
        // Logging-only here leaves the job hanging until EXPIRED and the
        // buyer has no signal that the seller couldn't fulfil. Deliver a
        // structured error payload through the standard /deliverable
        // endpoint so the evaluator can reject in EVALUATION and trigger
        // refund per ACP convention.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[seller] Error delivering job ${jobId}:`, err);
        try {
          await deliverJobFailure(jobId, reason);
        } catch (deliverErr) {
          console.error(
            `[seller] Failed to deliver failure notice for job ${jobId}:`,
            deliverErr
          );
        }
      }
    } else {
      console.log(
        `[seller] Job ${jobId} in TRANSACTION but no offering resolved — skipping`
      );
    }
    return;
  }

  console.log(
    `[seller] Job ${jobId} in phase ${AcpJobPhase[data.phase] ?? data.phase
    } — no action needed`
  );
}

// -- Main --

async function main() {
  checkForExistingProcess();

  writePidToConfig(process.pid);

  setupCleanupHandlers();

  let walletAddress: string;
  try {
    const agentData = await getMyAgentInfo();
    walletAddress = agentData.walletAddress;
    agentDirName = sanitizeAgentName(agentData.name);
    console.log(`[seller] Agent: ${agentData.name} (dir: ${agentDirName})`);
  } catch (err) {
    console.error("[seller] Failed to resolve agent info:", err);
    process.exit(1);
  }

  const allOfferings = listOfferings(agentDirName);
  const ready: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const name of allOfferings) {
    const check = assertOfferingReady(name);
    if (check.ready) ready.push(name);
    else skipped.push({ name, reason: check.reason });
  }
  console.log(
    `[seller] Active offerings: ${ready.length > 0 ? ready.join(", ") : "(none)"}`
  );
  if (skipped.length > 0) {
    console.warn(
      `[seller] Skipped ${skipped.length} offering(s) — required env missing:`
    );
    for (const s of skipped) {
      console.warn(`  - ${s.name}: ${s.reason}`);
    }
    console.warn(
      `[seller] Jobs targeting skipped offerings will be auto-rejected; ` +
        `set the missing env and restart to enable them.`
    );
  }

  connectAcpSocket({
    acpUrl: ACP_URL,
    walletAddress,
    callbacks: {
      onNewTask: (data) => {
        handleNewTask(data).catch((err) =>
          console.error("[seller] Unhandled error in handleNewTask:", err)
        );
      },
      onEvaluate: (data) => {
        console.log(
          `[seller] onEvaluate received for job ${data.id} — no action (evaluation handled externally)`
        );
      },
    },
  });

  console.log("[seller] Seller runtime is running. Waiting for jobs...\n");
}

main().catch((err) => {
  console.error("[seller] Fatal error:", err);
  process.exit(1);
});
