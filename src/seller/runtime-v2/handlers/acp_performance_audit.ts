/**
 * v2 handler: acp_performance_audit ($19, 35min)
 *
 * Required fields: acp_profile_or_offer, performance_goal.
 * Optional: current_metrics, constraints.
 * Deliverable: structured audit memo with offering inventory, pricing
 * analysis, jobs-history signal, top 5 findings, 30-day action plan.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString, optionalString } from "./_lib.js";

const SERVICE = "acp_performance_audit";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const acp_profile_or_offer = requireString(req, "acp_profile_or_offer");
  const performance_goal = requireString(req, "performance_goal");
  const current_metrics = optionalString(req, "current_metrics");
  const constraints = optionalString(req, "constraints");

  const content = await runConsultingAnalysis(SERVICE, {
    acp_profile_or_offer,
    performance_goal,
    ...(current_metrics ? { current_metrics } : {}),
    ...(constraints ? { constraints } : {}),
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
