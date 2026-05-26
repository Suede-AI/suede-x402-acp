/**
 * v2 handler: acp_performance_audit ($19, 35min)
 *
 * Required fields: acp_profile_or_offer (URL, UUID, EVM wallet, OR free-text
 * offer description), performance_goal (text).
 * Optional: current_metrics, constraints.
 *
 * Deliverable: structured audit memo — Performance Index, seven sub-scores,
 * offering inventory, pricing analysis, RANKED BLOCKERS, REVENUE ACTIONS,
 * 30-day action plan.
 *
 * Scoring discipline:
 *   - If `acp_profile_or_offer` looks like a URL / UUID / EVM wallet we call
 *     `resolveAcpProfile` to fetch the structured on-chain profile and audit
 *     ACP-side properties only (offerings, prices, SLAs, requirementSchema,
 *     chains, resources). Brand / website / socials are excluded.
 *   - If the resolver returns `resolved: false`, OR the input is free-text
 *     with no URL pattern, we fall back to a TEXT-ONLY audit and explicitly
 *     surface `scoringMethod: "text-only"` in the envelope so the buyer
 *     knows no on-chain ACP data was used.
 *   - If the buyer's `current_metrics` contradicts the resolved profile,
 *     the prompt instructs the LLM to penalise the claim and call out the
 *     discrepancy.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { resolveAcpProfile } from "../clients/acp-resolver.js";
import {
  looksLikeAcpIdentifier,
  optionalString,
  requireString,
} from "./_lib.js";

const SERVICE = "acp_performance_audit";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const acp_profile_or_offer = requireString(req, "acp_profile_or_offer");
  const performance_goal = requireString(req, "performance_goal");
  const current_metrics = optionalString(req, "current_metrics");
  const constraints = optionalString(req, "constraints");

  // Decide whether the input is an ACP identifier we can resolve (URL / UUID /
  // wallet) or free-text describing the offering. Free-text inputs skip the
  // network call entirely.
  const shouldResolve = looksLikeAcpIdentifier(acp_profile_or_offer);

  let resolvedProfile:
    | { agent: unknown; offerings: unknown; resources: unknown; chains: unknown }
    | undefined;
  let scoringMethod: "acp-profile-only" | "text-only" = "text-only";
  let profileId: string | undefined;
  let resolutionNote: string | undefined;

  if (shouldResolve) {
    const resolution = await resolveAcpProfile(acp_profile_or_offer);
    if (resolution.resolved) {
      const { agent, offerings, resources, chains } = resolution;
      resolvedProfile = { agent, offerings, resources, chains };
      scoringMethod = "acp-profile-only";
      profileId = resolution.agent.id;
    } else {
      // Identifier-shaped but couldn't resolve — note the gap in the
      // deliverable so the buyer knows the audit is text-only.
      resolutionNote = resolution.reason;
    }
  }

  const promptInput: Record<string, unknown> = {
    performance_goal,
    ...(current_metrics ? { current_metrics } : {}),
    ...(constraints ? { constraints } : {}),
  };

  if (resolvedProfile) {
    // Pass the STRUCTURED profile so the LLM grades observable ACP fields, not
    // the raw target string.
    promptInput.profile = resolvedProfile;
  } else {
    // Text-only mode: forward the original free-text/offer description and
    // surface the resolution failure (if any) so the LLM can flag it.
    promptInput.acp_profile_or_offer = acp_profile_or_offer;
    if (resolutionNote) promptInput.acp_resolution_note = resolutionNote;
  }

  const content = await runConsultingAnalysis(SERVICE, promptInput);

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
    scoringMethod,
    ...(profileId ? { profileId } : {}),
  });
}

register(SERVICE, handle);
