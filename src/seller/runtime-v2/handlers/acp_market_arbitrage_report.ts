/**
 * v2 handler: acp_market_arbitrage_report ($29, 60min)
 *
 * Required fields: agent_or_business, what_you_sell.
 * Optional: exclude_categories.
 * Deliverable: ranked arbitrage map of under-/over-priced offerings with
 * concrete arbitrage plays and risks.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString } from "./_lib.js";

const SERVICE = "acp_market_arbitrage_report";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const agent_or_business = requireString(req, "agent_or_business");
  const what_you_sell = requireString(req, "what_you_sell");
  const exclude_categories = optionalString(req, "exclude_categories");

  const content = await runConsultingAnalysis(SERVICE, {
    agent_or_business,
    what_you_sell,
    ...(exclude_categories ? { exclude_categories } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
