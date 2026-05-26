/**
 * v2 handler: acp_agent_setup ($49, 60min)
 *
 * Required fields: business_or_project, what_you_sell.
 * Optional: current_links (array of strings), owner_context.
 * Deliverable: end-to-end ACP setup package (positioning, offering lineup,
 * pricing strategy, copy pack, infra checklist, day 1-7 plan).
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
