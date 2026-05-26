/**
 * v2 handler: acp_buyer_growth_list ($15, 45min)
 *
 * Required fields: acp_offer, target_buyer.
 * Optional: market_or_platform, exclusions, agent_url_for_context (OPTIONAL
 *           ACP identifier used to ground outreach lines against the agent's
 *           real offering names).
 * Deliverable: 10 qualified buyer/partner targets with outreach sequencing.
 *
 * ACP enrichment:
 *   - When `agent_url_for_context` is provided and URL-shaped, we resolve the
 *     structured profile and pass it as "TARGET'S CURRENT ACP STATE" so each
 *     prospect's first-outreach line references the agent's real offering
 *     names (anchoring outreach to buyable artifacts, not vague descriptions).
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

const SERVICE = "acp_buyer_growth_list";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const acp_offer = requireString(req, "acp_offer");
  const target_buyer = requireString(req, "target_buyer");
  const market_or_platform = optionalString(req, "market_or_platform");
  const exclusions = optionalString(req, "exclusions");
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
    acp_offer,
    target_buyer,
    ...(market_or_platform ? { market_or_platform } : {}),
    ...(exclusions ? { exclusions } : {}),
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
