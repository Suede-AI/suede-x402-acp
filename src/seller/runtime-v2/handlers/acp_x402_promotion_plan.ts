/**
 * v2 handler: acp_x402_promotion_plan ($39, 45min)
 *
 * Required fields: agent_or_business, primary_offer.
 * Optional: audience, agent_url_for_context (OPTIONAL ACP identifier used to
 *           ground recommendations against the agent's real profile).
 * Deliverable: 14-day promotion plan across ACP, x402, Stripe Agentic, X /
 * LinkedIn, founder outreach, and (where relevant) traditional media.
 *
 * ACP enrichment:
 *   - When `agent_url_for_context` is provided and URL-shaped, we resolve the
 *     structured profile and pass it as "TARGET'S CURRENT ACP STATE" so the
 *     LLM aligns the promotion plan with the agent's real offering categories
 *     and price tiers (no pitching offerings the agent does not have).
 *   - The required input schema is UNCHANGED — `agent_url_for_context` is
 *     purely additive. Resolution failures degrade gracefully.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { resolveAcpProfile } from "../clients/acp-resolver.js";
import {
  looksLikeAcpIdentifier,
  optionalString,
  requireString,
} from "./_lib.js";

const SERVICE = "acp_x402_promotion_plan";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const agent_or_business = requireString(req, "agent_or_business");
  const primary_offer = requireString(req, "primary_offer");
  const audience = optionalString(req, "audience");
  const agent_url_for_context = optionalString(req, "agent_url_for_context");

  let acpContext: "resolved" | "not_provided" | "resolution_failed" =
    "not_provided";
  let resolvedProfile:
    | { agent: unknown; offerings: unknown; resources: unknown; chains: unknown }
    | undefined;

  if (agent_url_for_context && looksLikeAcpIdentifier(agent_url_for_context)) {
    const resolution = await resolveAcpProfile(agent_url_for_context);
    if (resolution.resolved) {
      const { agent, offerings, resources, chains } = resolution;
      resolvedProfile = { agent, offerings, resources, chains };
      acpContext = "resolved";
    } else {
      acpContext = "resolution_failed";
    }
  } else if (agent_url_for_context) {
    acpContext = "resolution_failed";
  }

  const promptInput: Record<string, unknown> = {
    agent_or_business,
    primary_offer,
    ...(audience ? { audience } : {}),
    ...(resolvedProfile ? { profile: resolvedProfile } : {}),
  };

  const content = await runConsultingAnalysis(SERVICE, promptInput);

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
    acpContext,
  });
}

register(SERVICE, handle);
