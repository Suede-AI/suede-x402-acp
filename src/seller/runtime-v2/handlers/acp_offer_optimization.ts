/**
 * v2 handler: acp_offer_optimization ($39, 45min)
 *
 * Required fields: agent_or_business, what_you_sell.
 * Optional: current_offerings (array of strings), target_buyer_agent.
 * Deliverable: rewritten ACP profile copy + 3-7 buyable job offerings with
 * prices, SLAs, requirement schemas, deliverables, keywords, rationale.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString, optionalStringArray } from "./_lib.js";

const SERVICE = "acp_offer_optimization";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const agent_or_business = requireString(req, "agent_or_business");
  const what_you_sell = requireString(req, "what_you_sell");
  const current_offerings = optionalStringArray(req, "current_offerings");
  const target_buyer_agent = optionalString(req, "target_buyer_agent");

  const content = await runConsultingAnalysis(SERVICE, {
    agent_or_business,
    what_you_sell,
    ...(current_offerings ? { current_offerings } : {}),
    ...(target_buyer_agent ? { target_buyer_agent } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
