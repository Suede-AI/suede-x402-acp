/**
 * v2 handler: agent_quick_score ($3, 5min)
 *
 * Required fields: target (URL, UUID, or EVM wallet for a Virtuals ACP agent).
 *
 * Deliverable: ACP-only scorecard — Performance Index (0-100), seven sub-scores
 * (DISCOVERABILITY, OFFER QUALITY, PRICING SIGNAL, TRUST / PROOF,
 * X402 / STABLECOIN, ACP COMPATIBILITY, MARKET OPPORTUNITY), verdict band,
 * headline, top blocker, and recommended next move.
 *
 * Scoring discipline:
 *   - The buyer's `target` is FIRST resolved to a structured ACP profile via
 *     `resolveAcpProfile` (hits api.acp.virtuals.io, no auth needed).
 *   - The LLM grades the STRUCTURED PROFILE JSON only — never the raw target
 *     string. This stops the model from grading external brand surface
 *     (websites, socials) the way the v1 acp.suedeai.ai engine does.
 *   - If the resolver fails, we return a TARGET_UNRESOLVED error envelope so
 *     the seller worker does not submit a hallucinated scorecard.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { resolveAcpProfile } from "../clients/acp-resolver.js";
import { requireString } from "./_lib.js";

const SERVICE = "agent_quick_score";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const target = requireString(req, "target");
  const resolution = await resolveAcpProfile(target);

  if (!resolution.resolved) {
    // Surface a structured "could not score" envelope. We MUST NOT submit a
    // success-looking JSON shape here — the buyer paid for an ACP grade and
    // the resolver could not produce one. Mirror the runtime's other failure
    // envelopes (markdown handlers use {type:"markdown",...}; this is the
    // error counterpart).
    return JSON.stringify({
      type: "error",
      service: SERVICE,
      code: "TARGET_UNRESOLVED",
      message: resolution.reason,
      retryable: false,
      schemaVersion: "v2-consulting-1",
    });
  }

  // Pass the STRUCTURED profile to the LLM. Stripping `resolved: true` keeps
  // the prompt focused on the data the rubric actually grades.
  const { agent, offerings, resources, chains } = resolution;
  const content = await runConsultingAnalysis(SERVICE, {
    profile: { agent, offerings, resources, chains },
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
    scoringMethod: "acp-profile-only",
    profileId: resolution.agent.id,
  });
}

register(SERVICE, handle);
