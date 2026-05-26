/**
 * v2 handler: acp_agent_setup ($49, 60min)
 *
 * Required fields: business_or_project, what_you_sell.
 * Optional: current_links (array of strings), owner_context.
 * Deliverable: end-to-end ACP setup package — agent positioning, public
 * description, 3-7 job offerings (pricing + SLAs + requirement schemas +
 * deliverables), resources, keywords, launch checklist, day 1-7 plan.
 *
 * Category 3: NOT APPLICABLE for ACP resolver enrichment. This offering is
 * for NEW agents that do NOT yet exist on ACP — the whole point is to set
 * them up from scratch, so there is no existing on-chain profile to resolve.
 * Resolver logic is intentionally NOT wired here. The prompt is framed
 * against the same 7-dimension ACP rubric as agent_quick_score, but as a
 * TARGET POSITION the builder should land on after executing the setup, not
 * a current grade.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString, optionalStringArray } from "./_lib.js";

const SERVICE = "acp_agent_setup";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const business_or_project = requireString(req, "business_or_project");
  const what_you_sell = requireString(req, "what_you_sell");
  const current_links = optionalStringArray(req, "current_links");
  const owner_context = optionalString(req, "owner_context");

  const content = await runConsultingAnalysis(SERVICE, {
    business_or_project,
    what_you_sell,
    ...(current_links ? { current_links } : {}),
    ...(owner_context ? { owner_context } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
