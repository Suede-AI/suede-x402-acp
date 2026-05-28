// =============================================================================
// v2 seller runtime — boots the AcpAgent, wires the entry handler to the
// offering registry, and keeps the process alive until SIGINT/SIGTERM.
//
// Usage:
//   npm run start:v2
//   ./bin/acp-v2.ts
//   ./node_modules/.bin/tsx src/seller/runtime-v2/index.ts
// =============================================================================

import "dotenv/config";
import "./handlers/index.js";

import type {
  AcpAgent,
  JobSession,
  JobRoomEntry,
} from "@virtuals-protocol/acp-node-v2";

import { createV2Agent } from "./agent.js";
import { dispatch, listRegistered } from "./dispatch.js";
import { assertReady as assertConsultingReady } from "./clients/consulting-client.js";
import { assertReady as assertVideoReady } from "./clients/video-client.js";
import { assertReady as assertMusicReady } from "./clients/music-client-v2.js";
import { resolveOfferingName, resolveRequirement } from "./dispatch-helpers.js";

// resolveOfferingName + resolveRequirement live in ./dispatch-helpers.ts so
// they can be unit-tested without importing this module (which boots the agent).

// -- main --

let mainStarted = false;

export async function main(): Promise<void> {
  // Both `npm run start:v2` (runs this file directly) and `bin/acp-v2.ts`
  // (imports main and calls it) wire up main(). The bottom-of-file auto-run
  // makes the direct path work; this guard prevents the bin shim from
  // double-booting when imported alongside its own main() call.
  if (mainStarted) return;
  mainStarted = true;

  console.log("[v2-seller] Booting v2 runtime…");
  console.log(
    `[v2-seller] Registered offerings (${listRegistered().length}): ${listRegistered().join(", ") || "(none)"}`
  );

  // Fail-fast on missing env (PR #10 parity with v1).
  // Each assertReady() throws if its client's required env is unset. We refuse
  // to register offerings — and therefore refuse to accept paid jobs — when we
  // can't fulfil them.
  const readinessChecks: Array<{ name: string; check: () => void }> = [
    { name: "consulting-client", check: assertConsultingReady },
    { name: "video-client", check: assertVideoReady },
    { name: "music-client-v2", check: assertMusicReady },
  ];
  for (const { name, check } of readinessChecks) {
    try {
      check();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[v2-seller] FATAL: ${name} is not ready — ${message}`
      );
      process.exit(1);
    }
  }

  const agent: AcpAgent = await createV2Agent();
  const address = await agent.getAddress();
  console.log(`[v2-seller] Agent address: ${address}`);

  // Prevent duplicate dispatch on SSE reconnect / event replay.
  const inflight = new Set<string>();

  agent.on("entry", async (session: JobSession, entry: JobRoomEntry) => {
    console.log(
      `[v2-seller] entry  jobId=${session.jobId}  kind=${entry.kind}` +
        (entry.kind === "system"
          ? `  event=${entry.event.type}`
          : `  contentType=${entry.contentType}`)
    );

    // Dispatch fires on a live `job.funded` system event. On restart the SDK
    // hydrates active jobs by replaying only the LAST room entry — if the buyer
    // sent anything after funding (e.g. a requirement/chat message), that last
    // entry is not `job.funded`, so a funded-but-undelivered job would never
    // dispatch (buyer paid, never delivered). Also fire when the hydrated
    // session is still in the `funded` state but the replayed entry isn't the
    // funding event. The inflight Set plus the `funded` status check guard
    // against double-dispatch: a submitted/completed job is no longer `funded`.
    const isFundedEvent =
      entry.kind === "system" && entry.event.type === "job.funded";
    const isHydratedFundedSession =
      session.status === "funded" && !isFundedEvent;
    if (!isFundedEvent && !isHydratedFundedSession) return;

    const dedupeKey = `${session.chainId}:${session.jobId}`;
    if (inflight.has(dedupeKey)) {
      console.log(
        `[v2-seller] job ${dedupeKey} already in flight — skipping duplicate dispatch`
      );
      return;
    }
    inflight.add(dedupeKey);

    try {
      const offeringName = await resolveOfferingName(session);
      if (!offeringName) {
        const errBody = JSON.stringify({
          type: "error",
          code: "UNKNOWN_OFFERING",
          message: "Could not resolve offering name from job description",
          retryable: false,
        });
        await session.submit(errBody);
        return;
      }

      const requirement = resolveRequirement(session);
      console.log(
        `[v2-seller] dispatch  offering="${offeringName}"  jobId=${session.jobId}`
      );

      const deliverable = await dispatch(offeringName, requirement);
      await session.submit(deliverable);
      console.log(`[v2-seller] submitted  jobId=${session.jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[v2-seller] dispatch failed  jobId=${session.jobId}:`,
        err
      );
      try {
        await session.submit(
          JSON.stringify({
            type: "error",
            code: "UPSTREAM_FAILURE",
            message,
            retryable: false,
          })
        );
      } catch (submitErr) {
        console.error(
          `[v2-seller] also failed to submit error notice for ${session.jobId}:`,
          submitErr
        );
      }
    } finally {
      inflight.delete(dedupeKey);
    }
  });

  let stopping = false;
  const shutdown = async (signal: string, exitCode: number) => {
    if (stopping) return;
    stopping = true;
    console.log(`[v2-seller] ${signal} received — stopping agent…`);
    try {
      await agent.stop();
    } catch (err) {
      console.error("[v2-seller] error during agent.stop():", err);
    }
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });
  process.on("uncaughtException", (err) => {
    console.error("[v2-seller] uncaughtException:", err);
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[v2-seller] unhandledRejection:", reason);
    // Match uncaughtException: an unhandled rejection leaves the worker in an
    // undefined state. Exit non-zero so the supervisor restarts cleanly rather
    // than continuing to accept paid jobs we may not be able to fulfil.
    void shutdown("unhandledRejection", 1);
  });

  await agent.start(() => {
    console.log("[v2-seller] SSE connected");
  });

  console.log("[v2-seller] v2 runtime is running. Waiting for jobs…\n");
}

main().catch((err) => {
  console.error("[v2-seller] fatal:", err);
  process.exit(1);
});
