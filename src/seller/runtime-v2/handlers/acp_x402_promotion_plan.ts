/**
 * v2 handler: acp_x402_promotion_plan ($39, 45min)
 *
 * Required fields: agent_or_business, primary_offer.
 * Optional: audience.
 * Deliverable: 14-day promotion plan across ACP, x402, Stripe Agentic, X /
 * LinkedIn, founder outreach, and (where relevant) traditional media.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString } from "./_lib.js";

const SERVICE = "acp_x402_promotion_plan";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const agent_or_business = requireString(req, "agent_or_business");
  const primary_offer = requireString(req, "primary_offer");
  const audience = optionalString(req, "audience");

  const content = await runConsultingAnalysis(SERVICE, {
    agent_or_business,
    primary_offer,
    ...(audience ? { audience } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
