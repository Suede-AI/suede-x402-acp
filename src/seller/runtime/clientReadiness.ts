// =============================================================================
// Client readiness — maps each offering to the env-dependent client it uses
// and verifies the client is ready to serve jobs before the seller registers
// the offering. Prevents the seller from accepting paid jobs it can't fulfil.
// =============================================================================

import { assertReady as assertVideoReady } from "../offerings/video-client.js";
import { assertReady as assertMusicReady } from "../offerings/music-client.js";
import { assertReady as assertConsultingReady } from "../offerings/acp-consulting-client.js";

type ClientName = "video" | "music" | "consulting";

const CLIENT_CHECKS: Record<ClientName, () => void> = {
  video: assertVideoReady,
  music: assertMusicReady,
  consulting: assertConsultingReady,
};

/**
 * Map an offering directory name to the client it depends on. Returns null
 * for offerings that don't reach any external service (none today, but the
 * shape is forward-compatible).
 */
export function clientForOffering(name: string): ClientName | null {
  if (
    name === "general_video" ||
    name === "meme_video" ||
    name.startsWith("product_showcase_video") ||
    name === "suede_video_generation"
  ) {
    return "video";
  }
  if (name.startsWith("suede_")) return "music";
  if (name === "agent_quick_score" || name.startsWith("acp_")) return "consulting";
  return null;
}

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: string };

/**
 * Check whether an offering's required env is configured. Returns
 * { ready: true } if the client's env is complete; { ready: false, reason }
 * otherwise. Memoizes per-client so we don't repeat env checks per offering.
 */
export function assertOfferingReady(name: string): ReadinessResult {
  const client = clientForOffering(name);
  if (!client) {
    return { ready: false, reason: `no client mapping for offering '${name}'` };
  }
  const cached = clientCache.get(client);
  if (cached) return cached;
  try {
    CLIENT_CHECKS[client]();
    const ok: ReadinessResult = { ready: true };
    clientCache.set(client, ok);
    return ok;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fail: ReadinessResult = { ready: false, reason };
    clientCache.set(client, fail);
    return fail;
  }
}

const clientCache = new Map<ClientName, ReadinessResult>();
