/**
 * v2 handler: agent_quick_score ($3, 5min)
 *
 * Required fields: target (URL or wallet/agent identifier).
 * Deliverable: Performance Index (0-100), seven sub-scores, verdict band,
 * single-line headline, top blocker, single recommended next move.
 */
import { register } from "../dispatch.js";
import { runConsultingAnalysis } from "../clients/consulting-client.js";
import { requireString } from "./_lib.js";

const SERVICE = "agent_quick_score";

export async function handle(req: Record<string, unknown>): Promise<string> {
  const target = requireString(req, "target");

  const content = await runConsultingAnalysis(SERVICE, {
    target,
  });

  return JSON.stringify({
    type: "markdown",
    service: SERVICE,
    content,
    schemaVersion: "v2-consulting-1",
  });
}

register(SERVICE, handle);
