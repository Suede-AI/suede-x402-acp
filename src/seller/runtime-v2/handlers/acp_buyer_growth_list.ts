/**
 * v2 handler: acp_buyer_growth_list ($15, 45min)
 *
 * Required fields: acp_offer, target_buyer.
 * Optional: market_or_platform, exclusions.
 * Deliverable: 10 qualified buyer/partner targets with outreach sequencing.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString } from "./_lib.js";

const SERVICE = "acp_buyer_growth_list";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const acp_offer = requireString(req, "acp_offer");
  const target_buyer = requireString(req, "target_buyer");
  const market_or_platform = optionalString(req, "market_or_platform");
  const exclusions = optionalString(req, "exclusions");

  const content = await runConsultingAnalysis(SERVICE, {
    acp_offer,
    target_buyer,
    ...(market_or_platform ? { market_or_platform } : {}),
    ...(exclusions ? { exclusions } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
